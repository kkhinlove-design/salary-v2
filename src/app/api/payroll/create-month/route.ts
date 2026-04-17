import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import { calculateInsurance, calculateRetirement } from '@/lib/insurance-rates';
import { lookupIncomeTax, calculateResidentTax, parseDependents } from '@/lib/tax-table';
import { distributeEmployee } from '@/lib/distribution';

/**
 * POST /api/payroll/create-month
 * 새 월 생성: 전월 데이터 복제 + 보험료/소득세 자동 계산 + 사업별 배분 자동 생성
 *
 * body: { yearMonth: "2026-04", payDate?: "2026-05-02", baseWorkDays?: 30 }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const { yearMonth, payDate, baseWorkDays = 31 } = await req.json();

  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: '올바른 형식: YYYY-MM' }, { status: 400 });
  }

  // 이미 존재하는지 확인
  const { data: existing } = await supabase
    .from('payroll_months')
    .select('id')
    .eq('year_month', yearMonth)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: `${yearMonth}은 이미 존재합니다` }, { status: 409 });
  }

  // 전월 찾기
  const { data: prevMonths } = await supabase
    .from('payroll_months')
    .select('id, year_month')
    .lt('year_month', yearMonth)
    .order('year_month', { ascending: false })
    .limit(1);

  const prevMonthId = prevMonths?.[0]?.id;

  // 1. 새 월 생성
  const { data: newMonth, error: monthErr } = await supabase
    .from('payroll_months')
    .insert({
      year_month: yearMonth,
      pay_date: payDate || null,
      status: 'draft',
      total_employees: 0,
      total_salary: 0,
      total_overtime: 0,
      total_employer_insurance: 0,
      total_retirement: 0,
    })
    .select()
    .single();

  if (monthErr) return NextResponse.json({ error: monthErr.message }, { status: 500 });

  const monthId = newMonth.id;
  const results = { monthId, employees: 0, payroll: 0, deductions: 0, employer: 0, assignments: 0, expenditures: 0 };

  // 2. 활성 직원 로드
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true);

  if (!employees || employees.length === 0) {
    return NextResponse.json({ ...results, message: '활성 직원이 없습니다' });
  }

  // 3. 전월 급여 데이터 로드 (기본값으로 사용)
  let prevPayroll: Record<string, any> = {};
  let prevAssignments: Record<string, any[]> = {};

  if (prevMonthId) {
    const { data: prevPay } = await supabase
      .from('payroll_details')
      .select('*')
      .eq('payroll_month_id', prevMonthId);
    if (prevPay) {
      prevPayroll = Object.fromEntries(prevPay.map(p => [p.employee_id, p]));
    }

    const { data: prevAssign } = await supabase
      .from('project_assignments')
      .select('*')
      .eq('payroll_month_id', prevMonthId);
    if (prevAssign) {
      for (const a of prevAssign) {
        if (!prevAssignments[a.employee_id]) prevAssignments[a.employee_id] = [];
        prevAssignments[a.employee_id].push(a);
      }
    }
  }

  // 4. 각 직원별 자동 계산
  const payrollRows: any[] = [];
  const deductionRows: any[] = [];
  const employerRows: any[] = [];
  const assignmentRows: any[] = [];

  let totalSalary = 0;
  let totalOvertime = 0;
  let totalEmpIns = 0;
  let totalRetirement = 0;

  for (const emp of employees) {
    // 전월 데이터 또는 기본값
    const prev = prevPayroll[emp.id] || {};
    const salary = emp.annual_salary || prev.monthly_salary || 0;
    const basePay = prev.base_pay || salary - (prev.nontax_subtotal || 0);
    const positionAllowance = prev.position_allowance || 0;
    const transport = prev.transport || 200000;
    const meal = prev.meal || 200000;
    const childcare = prev.childcare || 0;
    const nontaxSubtotal = transport + meal + childcare;
    const overtimePay = 0; // 초과수당은 매월 새로 입력

    // 과세소득 = 월급여 + 직책수당 (초과수당은 별도)
    const taxableBase = salary - nontaxSubtotal + positionAllowance;

    // 보험료 자동 계산
    const insurance = calculateInsurance(taxableBase, {
      exemptNationalPension: prev.national_pension === 0 && prevMonthId ? true : false,
      exemptEmployment: prev.employment_insurance === 0 && prevMonthId ? true : false,
    });

    // 소득세 자동 계산
    const dependents = parseDependents(emp.dependents);
    const incomeTax = lookupIncomeTax(taxableBase, dependents, emp.tax_rate);
    const residentTax = calculateResidentTax(incomeTax);

    // 퇴직연금
    const retirement = calculateRetirement(salary);

    // 과기공제 (전월과 동일)
    const scienceFund = emp.science_fund || 0;

    // 총 공제
    const totalDeduction = insurance.personal.subtotal + incomeTax + residentTax + scienceFund;
    const grossTotal = salary;
    const payTotal = salary + overtimePay;
    const netPay = payTotal - totalDeduction;

    // 급여상세
    payrollRows.push({
      payroll_month_id: monthId,
      employee_id: emp.id,
      monthly_salary: salary,
      base_pay: salary - nontaxSubtotal,
      position_allowance: positionAllowance,
      transport,
      meal,
      childcare,
      nontax_subtotal: nontaxSubtotal,
      gross_total: grossTotal,
      overtime_pay: overtimePay,
      other_pay: 0,
      pay_total: payTotal,
    });

    // 개인공제
    deductionRows.push({
      payroll_month_id: monthId,
      employee_id: emp.id,
      national_pension: insurance.personal.nationalPension,
      health_insurance: insurance.personal.healthInsurance,
      long_term_care: insurance.personal.longTermCare,
      employment_insurance: insurance.personal.employmentInsurance,
      insurance_subtotal: insurance.personal.subtotal,
      income_tax: incomeTax,
      resident_tax: residentTax,
      tax_subtotal: incomeTax + residentTax,
      science_fund: scienceFund,
      total_deduction: totalDeduction,
      net_pay: netPay,
    });

    // 기관부담
    employerRows.push({
      payroll_month_id: monthId,
      employee_id: emp.id,
      national_pension: insurance.employer.nationalPension,
      health_insurance: insurance.employer.healthInsurance,
      long_term_care: insurance.employer.longTermCare,
      employment_insurance: insurance.employer.employmentInsurance,
      industrial_accident: insurance.employer.industrialAccident,
      insurance_subtotal: insurance.employer.subtotal,
      retirement_pension: retirement,
      total: insurance.employer.subtotal + retirement,
    });

    totalSalary += payTotal;
    totalOvertime += overtimePay;
    totalEmpIns += insurance.employer.subtotal;
    totalRetirement += retirement;

    // 사업별 배분 (전월 참여율 복제)
    const prevAssign = prevAssignments[emp.id] || [];
    if (prevAssign.length > 0) {
      const payData = {
        monthlySalary: salary,
        basePay: salary - nontaxSubtotal,
        positionAllowance,
        transport,
        meal,
        childcare,
        overtimePay,
        scienceFund,
        insurancePersonal: insurance.personal.subtotal,
        incomeTax,
        residentTax,
        insuranceEmployer: insurance.employer.subtotal,
        retirementPension: retirement,
      };

      const assignments = prevAssign.map(a => ({
        projectId: a.project_id,
        participationRate: Number(a.participation_rate),
        workDays: baseWorkDays,
      }));

      const distributed = distributeEmployee(payData, assignments, baseWorkDays);
      for (const d of distributed) {
        assignmentRows.push({
          payroll_month_id: monthId,
          project_id: d.projectId,
          employee_id: emp.id,
          participation_rate: d.participationRate,
          work_days: d.workDays,
          salary_amount: d.salaryAmount,
          overtime_amount: d.overtimeAmount,
          science_fund: d.scienceFund,
          insurance_deduction: d.insuranceDeduction,
          income_tax: d.incomeTax,
          resident_tax: d.residentTax,
          tax_subtotal: d.taxSubtotal,
          net_pay: d.netPay,
          employer_insurance: d.employerInsurance,
          employer_retirement: d.employerRetirement,
          total_cost: d.totalCost,
        });
      }
    }
  }

  // 5. 일괄 삽입
  const batchInsert = async (table: string, rows: any[]) => {
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from(table).insert(rows.slice(i, i + 50));
      if (error) console.error(`${table} batch ${i}:`, error.message);
    }
    return rows.length;
  };

  results.payroll = await batchInsert('payroll_details', payrollRows);
  results.deductions = await batchInsert('personal_deductions', deductionRows);
  results.employer = await batchInsert('employer_contributions', employerRows);
  results.assignments = await batchInsert('project_assignments', assignmentRows);
  results.employees = employees.length;

  // 6. 사업별 지출 요약 자동 생성
  const projTotals: Record<string, any> = {};
  for (const a of assignmentRows) {
    const pid = a.project_id;
    if (!projTotals[pid]) {
      projTotals[pid] = {
        payroll_month_id: monthId,
        project_id: pid,
        salary: 0, overtime: 0, science_fund: 0,
        insurance_personal: 0, withholding_tax: 0, net_pay: 0,
        employer_insurance: 0, employer_retirement: 0, employer_subtotal: 0,
        total: 0,
      };
    }
    const t = projTotals[pid];
    t.salary += a.salary_amount;
    t.overtime += a.overtime_amount;
    t.science_fund += a.science_fund;
    t.insurance_personal += a.insurance_deduction;
    t.withholding_tax += a.tax_subtotal;
    t.net_pay += a.net_pay;
    t.employer_insurance += a.employer_insurance;
    t.employer_retirement += a.employer_retirement;
    t.employer_subtotal += a.employer_insurance + a.employer_retirement;
    t.total += a.salary_amount + a.overtime_amount + a.employer_insurance + a.employer_retirement;
  }

  // 사업 정보 가져와서 비고(fund_source) 매핑
  const { data: projects } = await supabase.from('projects').select('id, fund_source');
  const fundMap = Object.fromEntries((projects || []).map(p => [p.id, p.fund_source]));

  const expRows = Object.values(projTotals).map((t: any) => ({
    ...t,
    note: fundMap[t.project_id] || null,
  }));

  results.expenditures = await batchInsert('project_expenditures', expRows);

  // 7. 총괄 업데이트
  await supabase.from('payroll_months').update({
    total_employees: employees.length,
    total_salary: totalSalary,
    total_overtime: totalOvertime,
    total_employer_insurance: totalEmpIns,
    total_retirement: totalRetirement,
  }).eq('id', monthId);

  return NextResponse.json({
    success: true,
    message: `${yearMonth} 급여 데이터 생성 완료`,
    ...results,
  });
}
