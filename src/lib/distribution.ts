/**
 * 사업별 인건비 배분 엔진
 *
 * 핵심 로직:
 * 1. 급여 = 연봉월액 × 참여율 / 기준일수 × 참여일수
 * 2. 보험료/세금 = 전액 × 참여율 (참여율 비례)
 * 3. 반올림 잔액 = 최대 참여율 사업에 할당 (+-1원 보정 자동화)
 */

export interface AssignmentInput {
  projectId: string;
  participationRate: number; // 0.0 ~ 1.0
  workDays: number; // 참여일수
}

export interface EmployeePayData {
  monthlySalary: number;     // 연봉월액
  basePay: number;           // 월급여(과세)
  positionAllowance: number; // 직책수당
  transport: number;         // 교통비
  meal: number;              // 식비
  childcare: number;         // 보육수당
  overtimePay: number;       // 초과수당
  scienceFund: number;       // 과기공제
  insurancePersonal: number; // 사회보험(개인부담) 소계
  incomeTax: number;         // 소득세
  residentTax: number;       // 주민세
  insuranceEmployer: number; // 기관부담 보험 소계
  retirementPension: number; // 퇴직연금
}

export interface DistributionResult {
  projectId: string;
  participationRate: number;
  workDays: number;
  salaryAmount: number;      // 급여
  overtimeAmount: number;    // 초과수당
  scienceFund: number;       // 과기공제
  insuranceDeduction: number; // 사회보험(개인)
  incomeTax: number;         // 소득세
  residentTax: number;       // 주민세
  taxSubtotal: number;       // 원천세계
  netPay: number;            // 실지급액
  employerInsurance: number; // 기관부담 보험
  employerRetirement: number; // 퇴직연금
  totalCost: number;         // 총부담액
}

/**
 * 비례배분 + 잔액 보정
 * amount를 rates[] 비율로 배분하되, 반올림 잔액을 최대비율 항목에 할당
 */
function distributeWithRemainder(amount: number, rates: number[]): number[] {
  const total = rates.reduce((s, r) => s + r, 0);
  if (total === 0) return rates.map(() => 0);

  const distributed = rates.map(r => Math.round(amount * r / total));
  const diff = amount - distributed.reduce((s, v) => s + v, 0);

  if (diff !== 0) {
    // 잔액을 최대 비율 항목에 할당
    const maxIdx = rates.indexOf(Math.max(...rates));
    distributed[maxIdx] += diff;
  }

  return distributed;
}

/**
 * 한 직원의 사업별 인건비 배분 계산
 */
export function distributeEmployee(
  pay: EmployeePayData,
  assignments: AssignmentInput[],
  baseWorkDays: number = 31 // 월 기준일수
): DistributionResult[] {
  const rates = assignments.map(a => a.participationRate);

  // 급여는 참여율 × 참여일수/기준일수로 계산
  const salaries = assignments.map(a =>
    Math.round(pay.monthlySalary * a.participationRate / baseWorkDays * a.workDays)
  );

  // 초과수당, 과기공제, 보험, 세금은 참여율 비례 배분
  const overtimes = distributeWithRemainder(pay.overtimePay, rates);
  const scienceFunds = distributeWithRemainder(pay.scienceFund, rates);
  const insurances = distributeWithRemainder(pay.insurancePersonal, rates);
  const incomeTaxes = distributeWithRemainder(pay.incomeTax, rates);
  const residentTaxes = distributeWithRemainder(pay.residentTax, rates);
  const empInsurances = distributeWithRemainder(pay.insuranceEmployer, rates);
  const retirements = assignments.map(a =>
    Math.round(pay.retirementPension * a.participationRate / baseWorkDays * a.workDays)
  );

  return assignments.map((a, i) => {
    const taxSub = incomeTaxes[i] + residentTaxes[i];
    const netPay = salaries[i] + overtimes[i] - scienceFunds[i] - insurances[i] - taxSub;
    const totalCost = salaries[i] + overtimes[i] + empInsurances[i] + retirements[i];

    return {
      projectId: a.projectId,
      participationRate: a.participationRate,
      workDays: a.workDays,
      salaryAmount: salaries[i],
      overtimeAmount: overtimes[i],
      scienceFund: scienceFunds[i],
      insuranceDeduction: insurances[i],
      incomeTax: incomeTaxes[i],
      residentTax: residentTaxes[i],
      taxSubtotal: taxSub,
      netPay,
      employerInsurance: empInsurances[i],
      employerRetirement: retirements[i],
      totalCost,
    };
  });
}

/**
 * 중도입사/퇴사 일할계산
 */
export function prorateSalary(
  monthlySalary: number,
  workDays: number,
  totalDaysInMonth: number
): number {
  return Math.round(monthlySalary / totalDaysInMonth * workDays);
}
