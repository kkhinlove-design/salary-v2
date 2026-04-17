import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import { calculateInsurance, calculateRetirement } from '@/lib/insurance-rates';
import { lookupIncomeTax, calculateResidentTax, parseDependents } from '@/lib/tax-table';
import { distributeEmployee } from '@/lib/distribution';

/**
 * POST /api/payroll/calculate
 * 기존 월의 보험료/소득세/배분 재계산
 *
 * body: { monthId: string }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const { monthId } = await req.json();

  if (!monthId) {
    return NextResponse.json({ error: 'monthId 필요' }, { status: 400 });
  }

  // 월 정보
  const { data: month } = await supabase
    .from('payroll_months')
    .select('*')
    .eq('id', monthId)
    .single();
  if (!month) return NextResponse.json({ error: '해당 월을 찾을 수 없습니다' }, { status: 404 });

  // 급여 상세 로드
  const { data: payrolls } = await supabase
    .from('payroll_details')
    .select('*, employees(*)')
    .eq('payroll_month_id', monthId);

  if (!payrolls || payrolls.length === 0) {
    return NextResponse.json({ error: '급여 데이터가 없습니다' }, { status: 404 });
  }

  // 기존 배치 로드
  const { data: existingAssignments } = await supabase
    .from('project_assignments')
    .select('*')
    .eq('payroll_month_id', monthId);

  const assignMap: Record<string, any[]> = {};
  for (const a of existingAssignments || []) {
    if (!assignMap[a.employee_id]) assignMap[a.employee_id] = [];
    assignMap[a.employee_id].push(a);
  }

  // 기존 공제/기관부담 삭제 후 재생성
  await supabase.from('personal_deductions').delete().eq('payroll_month_id', monthId);
  await supabase.from('employer_contributions').delete().eq('payroll_month_id', monthId);
  await supabase.from('project_assignments').delete().eq('payroll_month_id', monthId);
  await supabase.from('project_expenditures').delete().eq('payroll_month_id', monthId);

  const deductionRows: any[] = [];
  const employerRows: any[] = [];
  const assignmentRows: any[] = [];
  let totalSalary = 0, totalOvertime = 0, totalEmpIns = 0, totalRetirement = 0;

  for (const p of payrolls) {
    const emp = p.employees;
    const taxableBase = p.base_pay + p.position_allowance;

    // 보험료 재계산
    const insurance = calculateInsurance(taxableBase);
    const dependents = parseDependents(emp?.dependents);
    const taxableIncome = taxableBase + p.overtime_pay;
    const incomeTax = lookupIncomeTax(taxableIncome, dependents, emp?.tax_rate || 100);
    const residentTax = calculateResidentTax(incomeTax);
    const retirement = calculateRetirement(p.monthly_salary);
    const scienceFund = emp?.science_fund || 0;
    const totalDeduction = insurance.personal.subtotal + incomeTax + residentTax + scienceFund;
    const netPay = p.pay_total - totalDeduction;

    deductionRows.push({
      payroll_month_id: monthId,
      employee_id: p.employee_id,
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

    employerRows.push({
      payroll_month_id: monthId,
      employee_id: p.employee_id,
      national_pension: insurance.employer.nationalPension,
      health_insurance: insurance.employer.healthInsurance,
      long_term_care: insurance.employer.longTermCare,
      employment_insurance: insurance.employer.employmentInsurance,
      industrial_accident: insurance.employer.industrialAccident,
      insurance_subtotal: insurance.employer.subtotal,
      retirement_pension: retirement,
      total: insurance.employer.subtotal + retirement,
    });

    totalSalary += p.pay_total;
    totalOvertime += p.overtime_pay;
    totalEmpIns += insurance.employer.subtotal;
    totalRetirement += retirement;

    // 사업별 배분 재계산
    const assigns = assignMap[p.employee_id] || [];
    if (assigns.length > 0) {
      const payData = {
        monthlySalary: p.monthly_salary,
        basePay: p.base_pay,
        positionAllowance: p.position_allowance,
        transport: p.transport,
        meal: p.meal,
        childcare: p.childcare,
        overtimePay: p.overtime_pay,
        scienceFund,
        insurancePersonal: insurance.personal.subtotal,
        incomeTax,
        residentTax,
        insuranceEmployer: insurance.employer.subtotal,
        retirementPension: retirement,
      };

      const inputs = assigns.map((a: any) => ({
        projectId: a.project_id,
        participationRate: Number(a.participation_rate),
        workDays: a.work_days,
      }));

      const distributed = distributeEmployee(payData, inputs);
      for (const d of distributed) {
        assignmentRows.push({
          payroll_month_id: monthId,
          project_id: d.projectId,
          employee_id: p.employee_id,
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

  // 일괄 삽입
  const batchInsert = async (table: string, rows: any[]) => {
    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from(table).insert(rows.slice(i, i + 50));
    }
  };

  await batchInsert('personal_deductions', deductionRows);
  await batchInsert('employer_contributions', employerRows);
  await batchInsert('project_assignments', assignmentRows);

  // 사업별 지출 집계
  const projTotals: Record<string, any> = {};
  for (const a of assignmentRows) {
    const pid = a.project_id;
    if (!projTotals[pid]) {
      projTotals[pid] = {
        payroll_month_id: monthId, project_id: pid,
        salary: 0, overtime: 0, science_fund: 0,
        insurance_personal: 0, withholding_tax: 0, net_pay: 0,
        employer_insurance: 0, employer_retirement: 0, employer_subtotal: 0, total: 0,
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

  const { data: projects } = await supabase.from('projects').select('id, fund_source');
  const fundMap = Object.fromEntries((projects || []).map(p => [p.id, p.fund_source]));
  const expRows = Object.values(projTotals).map((t: any) => ({ ...t, note: fundMap[t.project_id] || null }));
  await batchInsert('project_expenditures', expRows);

  // 총괄 업데이트
  await supabase.from('payroll_months').update({
    total_employees: payrolls.length,
    total_salary: totalSalary,
    total_overtime: totalOvertime,
    total_employer_insurance: totalEmpIns,
    total_retirement: totalRetirement,
  }).eq('id', monthId);

  return NextResponse.json({
    success: true,
    message: '재계산 완료',
    deductions: deductionRows.length,
    employer: employerRows.length,
    assignments: assignmentRows.length,
    expenditures: expRows.length,
  });
}
