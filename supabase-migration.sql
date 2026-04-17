-- ============================================
-- 인건비 관리 시스템 v2 - DB 스키마
-- ============================================

-- 1. 급여월 (payroll_months)
CREATE TABLE IF NOT EXISTS payroll_months (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month text NOT NULL UNIQUE, -- '2026-03'
  pay_date date,
  total_employees int DEFAULT 0,
  total_salary bigint DEFAULT 0,
  total_overtime bigint DEFAULT 0,
  total_employer_insurance bigint DEFAULT 0,
  total_retirement bigint DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft','confirmed','closed')),
  created_at timestamptz DEFAULT now()
);

-- 2. 직원 (employees)
CREATE TABLE IF NOT EXISTS employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  hire_date date,
  base_date date, -- 기산일자
  annual_salary bigint DEFAULT 0,
  dependents text, -- '3', '4(2)' 등
  tax_rate int DEFAULT 100,
  science_fund bigint DEFAULT 0, -- 과학기술공제
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3. 사업 (projects)
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  short_name text,
  fund_source text, -- '운영비 계좌(기업은행)', 'E-나라도움', 'RCMS', '보탬e', '계좌이체(기업은행)'
  fund_type text, -- '국비', '도비', '군비', '시비', '운영비'
  is_substitute boolean DEFAULT false, -- 대체집행 여부
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4. 급여 상세 (payroll_details) - 총괄 시트 데이터
CREATE TABLE IF NOT EXISTS payroll_details (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  monthly_salary bigint DEFAULT 0, -- 연봉월액
  base_pay bigint DEFAULT 0, -- 월급여(과세)
  position_allowance bigint DEFAULT 0, -- 직책수당
  transport bigint DEFAULT 0, -- 교통비(비과세)
  meal bigint DEFAULT 0, -- 식비(비과세)
  childcare bigint DEFAULT 0, -- 보육수당(비과세)
  nontax_subtotal bigint DEFAULT 0, -- 비과세 소계
  gross_total bigint DEFAULT 0, -- 사업총계
  overtime_pay bigint DEFAULT 0, -- 초과수당
  other_pay bigint DEFAULT 0, -- 기타
  pay_total bigint DEFAULT 0, -- 지급총액
  UNIQUE(payroll_month_id, employee_id)
);

-- 5. 개인공제 (personal_deductions)
CREATE TABLE IF NOT EXISTS personal_deductions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  national_pension bigint DEFAULT 0, -- 국민연금
  health_insurance bigint DEFAULT 0, -- 건강보험
  long_term_care bigint DEFAULT 0, -- 장기요양
  employment_insurance bigint DEFAULT 0, -- 고용보험
  insurance_subtotal bigint DEFAULT 0,
  income_tax bigint DEFAULT 0, -- 소득세
  resident_tax bigint DEFAULT 0, -- 주민세
  tax_subtotal bigint DEFAULT 0,
  science_fund bigint DEFAULT 0, -- 과학기술공제
  total_deduction bigint DEFAULT 0, -- 공제합계
  net_pay bigint DEFAULT 0, -- 실지급액
  UNIQUE(payroll_month_id, employee_id)
);

-- 6. 기관부담 (employer_contributions)
CREATE TABLE IF NOT EXISTS employer_contributions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  national_pension bigint DEFAULT 0,
  health_insurance bigint DEFAULT 0,
  long_term_care bigint DEFAULT 0,
  employment_insurance bigint DEFAULT 0,
  industrial_accident bigint DEFAULT 0, -- 산재보험
  insurance_subtotal bigint DEFAULT 0,
  retirement_pension bigint DEFAULT 0, -- 퇴직연금
  total bigint DEFAULT 0,
  UNIQUE(payroll_month_id, employee_id)
);

-- 7. 사업별 배치 (project_assignments) - 핵심: 참여율 기반 배분
CREATE TABLE IF NOT EXISTS project_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  participation_rate numeric(5,2) DEFAULT 0, -- 0.00 ~ 1.00
  work_days int DEFAULT 0,
  salary_amount bigint DEFAULT 0, -- 급여지급액
  overtime_amount bigint DEFAULT 0, -- 초과수당
  science_fund bigint DEFAULT 0, -- 과기공제
  insurance_deduction bigint DEFAULT 0, -- 사회보험(개인)
  income_tax bigint DEFAULT 0, -- 소득세
  resident_tax bigint DEFAULT 0, -- 주민세
  tax_subtotal bigint DEFAULT 0, -- 원천세계
  net_pay bigint DEFAULT 0, -- 실지급액
  employer_insurance bigint DEFAULT 0, -- 기관부담 사회보험
  employer_retirement bigint DEFAULT 0, -- 기관부담 퇴직연금
  total_cost bigint DEFAULT 0, -- 총부담액
  UNIQUE(payroll_month_id, project_id, employee_id)
);

-- 8. 사업별 지출 요약 (project_expenditures)
CREATE TABLE IF NOT EXISTS project_expenditures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  salary bigint DEFAULT 0,
  overtime bigint DEFAULT 0,
  science_fund bigint DEFAULT 0,
  insurance_personal bigint DEFAULT 0,
  withholding_tax bigint DEFAULT 0,
  net_pay bigint DEFAULT 0,
  employer_insurance bigint DEFAULT 0,
  employer_retirement bigint DEFAULT 0,
  employer_subtotal bigint DEFAULT 0,
  total bigint DEFAULT 0,
  note text,
  UNIQUE(payroll_month_id, project_id)
);

-- 9. 초과근무 (overtime_records)
CREATE TABLE IF NOT EXISTS overtime_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  work_date date,
  clock_in timestamptz,
  clock_out timestamptz,
  in_type text, -- '정상출근', '휴일출근', '조기출근'
  out_type text, -- '연장근무', '휴일퇴근'
  overtime_duration interval,
  approved_duration interval,
  note text
);

-- 10. 초과근무 요약 (overtime_summary)
CREATE TABLE IF NOT EXISTS overtime_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month_id uuid REFERENCES payroll_months(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  project_name text,
  hourly_rate numeric(12,2) DEFAULT 0,
  base_hourly_rate numeric(12,2) DEFAULT 0,
  total_hours numeric(6,2) DEFAULT 0,
  approved_hours numeric(6,2) DEFAULT 0,
  overtime_pay bigint DEFAULT 0,
  UNIQUE(payroll_month_id, employee_id)
);

-- RLS 정책 (공개 접근 허용 - 내부 관리 시스템)
ALTER TABLE payroll_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenditures ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON payroll_months FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payroll_details FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON personal_deductions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON employer_contributions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON project_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON project_expenditures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON overtime_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON overtime_summary FOR ALL USING (true) WITH CHECK (true);
