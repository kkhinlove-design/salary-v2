/**
 * 2026년 4대보험 요율 (역산 검증 완료)
 * - 국민연금: 기준소득월액의 9% (사업장 4.5% + 개인 4.5%)
 * - 건강보험: 보수월액의 7.09% (사업장 3.545% + 개인 3.545%)
 * - 장기요양: 건강보험의 13.14% (사업장 50% + 개인 50%)
 * - 고용보험 개인: 보수월액의 0.9%
 * - 고용보험 기업: 보수월액의 1.15% (150인 미만 우선지원대상기업)
 * - 산재보험: 보수월액의 0.659% (전액 기업부담)
 */

export const INSURANCE_RATES = {
  // 국민연금
  nationalPension: {
    total: 0.09,
    employee: 0.045,
    employer: 0.045,
    // 2026년 기준소득월액 상한: 6,170,000원 / 하한: 390,000원
    upperLimit: 6170000,
    lowerLimit: 390000,
  },
  // 건강보험
  healthInsurance: {
    total: 0.0709,
    employee: 0.03545,
    employer: 0.03545,
  },
  // 장기요양보험 (건강보험의 비율)
  longTermCare: {
    rateOfHealth: 0.1314,
  },
  // 고용보험
  employmentInsurance: {
    employee: 0.009,
    employer: 0.0115, // 150인 미만 우선지원대상기업
  },
  // 산재보험 (전액 기업부담)
  industrialAccident: {
    employer: 0.00659,
  },
};

export interface InsuranceResult {
  // 개인부담
  personal: {
    nationalPension: number;
    healthInsurance: number;
    longTermCare: number;
    employmentInsurance: number;
    subtotal: number;
  };
  // 기관부담
  employer: {
    nationalPension: number;
    healthInsurance: number;
    longTermCare: number;
    employmentInsurance: number;
    industrialAccident: number;
    subtotal: number;
  };
}

/**
 * 보수월액 기반 4대보험료 자동 산출
 * @param monthlyPay 보수월액 (과세 기준)
 * @param options 면제 옵션
 */
export function calculateInsurance(
  monthlyPay: number,
  options?: {
    exemptNationalPension?: boolean; // 국민연금 면제
    exemptEmployment?: boolean; // 고용보험 면제 (65세 이상 등)
  }
): InsuranceResult {
  const r = INSURANCE_RATES;
  const exempt = options || {};

  // 국민연금: 기준소득월액 상하한 적용
  let pensionBase = monthlyPay;
  if (pensionBase > r.nationalPension.upperLimit) pensionBase = r.nationalPension.upperLimit;
  if (pensionBase < r.nationalPension.lowerLimit) pensionBase = r.nationalPension.lowerLimit;

  const npTotal = exempt.exemptNationalPension ? 0 : Math.round(pensionBase * r.nationalPension.total);
  const npPersonal = exempt.exemptNationalPension ? 0 : Math.round(npTotal / 2);
  const npEmployer = exempt.exemptNationalPension ? 0 : Math.round(npTotal / 2);

  // 건강보험
  const healthPersonal = Math.round(monthlyPay * r.healthInsurance.employee);
  const healthEmployer = Math.round(monthlyPay * r.healthInsurance.employer);

  // 장기요양 (건강보험의 13.14%)
  const ltcPersonal = Math.round(healthPersonal * r.longTermCare.rateOfHealth);
  const ltcEmployer = Math.round(healthEmployer * r.longTermCare.rateOfHealth);

  // 고용보험
  const empInsPersonal = exempt.exemptEmployment ? 0 : Math.round(monthlyPay * r.employmentInsurance.employee);
  const empInsEmployer = exempt.exemptEmployment ? 0 : Math.round(monthlyPay * r.employmentInsurance.employer);

  // 산재보험
  const industrialAccident = Math.round(monthlyPay * r.industrialAccident.employer);

  return {
    personal: {
      nationalPension: npPersonal,
      healthInsurance: healthPersonal,
      longTermCare: ltcPersonal,
      employmentInsurance: empInsPersonal,
      subtotal: npPersonal + healthPersonal + ltcPersonal + empInsPersonal,
    },
    employer: {
      nationalPension: npEmployer,
      healthInsurance: healthEmployer,
      longTermCare: ltcEmployer,
      employmentInsurance: empInsEmployer,
      industrialAccident,
      subtotal: npEmployer + healthEmployer + ltcEmployer + empInsEmployer + industrialAccident,
    },
  };
}

/**
 * 퇴직연금 계산
 */
export function calculateRetirement(monthlySalary: number): number {
  return Math.round(monthlySalary / 12);
}

/**
 * 초과근무 지급단가 계산
 * 통상시급 = 연봉월액 / 209시간
 * 지급단가 = 통상시급 * 1.5배
 */
export function calculateOvertimeRate(monthlySalary: number) {
  const baseHourly = monthlySalary / 209;
  const overtimeRate = baseHourly * 1.5;
  return { baseHourly, overtimeRate };
}

/**
 * 초과수당 계산 (상한 350,000원)
 */
export function calculateOvertimePay(monthlySalary: number, approvedHours: number): number {
  const { overtimeRate } = calculateOvertimeRate(monthlySalary);
  const raw = overtimeRate * approvedHours;
  const capped = Math.min(raw, 350000);
  return Math.floor(capped / 10) * 10; // 10원 미만 절사
}
