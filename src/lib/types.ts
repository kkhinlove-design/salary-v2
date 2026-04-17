export interface PayrollMonth {
  id: string;
  year_month: string;
  pay_date: string | null;
  total_employees: number;
  total_salary: number;
  total_overtime: number;
  total_employer_insurance: number;
  total_retirement: number;
  status: 'draft' | 'confirmed' | 'closed';
  created_at: string;
}

export interface Employee {
  id: string;
  name: string;
  hire_date: string | null;
  base_date: string | null;
  annual_salary: number;
  dependents: string | null;
  tax_rate: number;
  science_fund: number;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  short_name: string | null;
  fund_source: string | null;
  fund_type: string | null;
  is_substitute: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PayrollDetail {
  id: string;
  payroll_month_id: string;
  employee_id: string;
  monthly_salary: number;
  base_pay: number;
  position_allowance: number;
  transport: number;
  meal: number;
  childcare: number;
  nontax_subtotal: number;
  gross_total: number;
  overtime_pay: number;
  other_pay: number;
  pay_total: number;
  employees?: Employee;
}

export interface PersonalDeduction {
  id: string;
  payroll_month_id: string;
  employee_id: string;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  insurance_subtotal: number;
  income_tax: number;
  resident_tax: number;
  tax_subtotal: number;
  science_fund: number;
  total_deduction: number;
  net_pay: number;
  employees?: Employee;
}

export interface EmployerContribution {
  id: string;
  payroll_month_id: string;
  employee_id: string;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  industrial_accident: number;
  insurance_subtotal: number;
  retirement_pension: number;
  total: number;
  employees?: Employee;
}

export interface ProjectAssignment {
  id: string;
  payroll_month_id: string;
  project_id: string;
  employee_id: string;
  participation_rate: number;
  work_days: number;
  salary_amount: number;
  overtime_amount: number;
  science_fund: number;
  insurance_deduction: number;
  income_tax: number;
  resident_tax: number;
  tax_subtotal: number;
  net_pay: number;
  employer_insurance: number;
  employer_retirement: number;
  total_cost: number;
  employees?: Employee;
  projects?: Project;
}

export interface ProjectExpenditure {
  id: string;
  payroll_month_id: string;
  project_id: string;
  salary: number;
  overtime: number;
  science_fund: number;
  insurance_personal: number;
  withholding_tax: number;
  net_pay: number;
  employer_insurance: number;
  employer_retirement: number;
  employer_subtotal: number;
  total: number;
  note: string | null;
  projects?: Project;
}

export interface OvertimeSummary {
  id: string;
  payroll_month_id: string;
  employee_id: string;
  project_name: string;
  hourly_rate: number;
  base_hourly_rate: number;
  total_hours: number;
  approved_hours: number;
  overtime_pay: number;
  employees?: Employee;
}

export interface OvertimeRecord {
  id: string;
  payroll_month_id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  in_type: string | null;
  out_type: string | null;
  overtime_duration: string | null;
  approved_duration: string | null;
  note: string | null;
  employees?: Employee;
}
