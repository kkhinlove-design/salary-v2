/**
 * 엑셀 데이터 → Supabase 시딩 스크립트
 * 실행: node scripts/seed.mjs
 */
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://qylouygonwilofgfmwyf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5bG91eWdvbndpbG9mZ2Ztd3lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM4NjA3MiwiZXhwIjoyMDkxOTYyMDcyfQ.WRq-cAto6T0MlY3chwvqnyIiCBQo9pb5TQ8Bvs7IWPA';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const EXCEL_PATH = 'D:/claude/salary v2/인건비_2026. 3월..xlsx';
const buf = readFileSync(EXCEL_PATH);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

function getSheet(name) {
  return wb.Sheets[name];
}

function cellVal(ws, ref) {
  const cell = ws[ref];
  return cell ? cell.v : null;
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

// ========= 1. payroll_months =========
async function seedPayrollMonth() {
  console.log('--- payroll_months ---');
  const { data, error } = await supabase.from('payroll_months').upsert({
    year_month: '2026-03',
    pay_date: '2026-04-03',
    total_employees: 84,
    total_salary: 268326773,
    total_overtime: 10254390,
    total_employer_insurance: 23826650,
    total_retirement: 18812711,
    status: 'confirmed',
  }, { onConflict: 'year_month' }).select();
  if (error) { console.error(error); return null; }
  console.log('  payroll_month created:', data[0].id);
  return data[0].id;
}

// ========= 2. employees (from 총괄 + 개인공제 + 기관부담) =========
async function seedEmployees(monthId) {
  console.log('--- employees ---');
  const wsTotal = getSheet('총괄');
  const wsDed = getSheet('개인공제');
  const wsEmp = getSheet('기관부담');

  // 개인공제에서 부양가족, 세율 정보 수집
  const dedInfo = {};
  for (let r = 8; r <= 100; r++) {
    const name = cellVal(wsDed, `A${r}`);
    if (!name || name === '합계') break;
    dedInfo[name] = {
      dependents: cellVal(wsDed, `D${r}`) ? String(cellVal(wsDed, `D${r}`)) : null,
      tax_rate: num(cellVal(wsDed, `E${r}`)) || 100,
      science_fund: num(cellVal(wsDed, `N${r}`)),
    };
  }

  // 기관부담에서 입사일, 기산일
  const empInfo = {};
  for (let r = 8; r <= 100; r++) {
    const name = cellVal(wsEmp, `A${r}`);
    if (!name || name === '합계') break;
    const hd = cellVal(wsEmp, `K${r}`);
    const bd = cellVal(wsEmp, `L${r}`);
    empInfo[name] = {
      hire_date: hd ? parseKorDate(hd) : null,
      base_date: bd ? parseKorDate(bd) : null,
    };
  }

  // 총괄에서 직원 목록 + 연봉월액
  const employees = [];
  for (let r = 9; r <= 100; r++) {
    const name = cellVal(wsTotal, `A${r}`);
    if (!name || name === '합계' || name === '총합계') break;
    const salary = num(cellVal(wsTotal, `B${r}`));
    const di = dedInfo[name] || {};
    const ei = empInfo[name] || {};
    employees.push({
      name,
      annual_salary: salary,
      hire_date: ei.hire_date || null,
      base_date: ei.base_date || null,
      dependents: di.dependents || null,
      tax_rate: di.tax_rate || 100,
      science_fund: di.science_fund || 0,
      is_active: true,
    });
  }

  // 사업별 시트에만 있는 직원 추가
  const existingNames = new Set(employees.map(e => e.name));
  const projectSheets = wb.SheetNames.filter(n =>
    !['산재 고용보험', '건강 요양보험', '국민연금', '사업별 지출내역', '총괄', '개인공제', '기관부담', '초과근무수당', '3월 초과근무대장'].includes(n)
  );

  for (const sn of projectSheets) {
    const ws = getSheet(sn);
    for (let r = 7; r <= 30; r++) {
      const name = cellVal(ws, `A${r}`);
      if (!name || name === '합계') break;
      const cleanName = name.replace(/\(.*\)/, '').trim();
      if (!existingNames.has(cleanName) && !existingNames.has(name)) {
        employees.push({
          name: cleanName,
          annual_salary: 0,
          hire_date: null,
          base_date: null,
          dependents: null,
          tax_rate: 100,
          science_fund: 0,
          is_active: true,
        });
        existingNames.add(cleanName);
      }
    }
  }

  // 배치 업서트
  const { data, error } = await supabase.from('employees').upsert(employees, { onConflict: 'name', ignoreDuplicates: true }).select();
  if (error) {
    // name 충돌 시 개별 삽입
    console.log('  bulk failed, inserting individually...');
    for (const emp of employees) {
      const existing = await supabase.from('employees').select('id').eq('name', emp.name).limit(1);
      if (existing.data && existing.data.length > 0) continue;
      await supabase.from('employees').insert(emp);
    }
    const { data: all } = await supabase.from('employees').select('*');
    console.log(`  employees: ${all?.length || 0}명`);
    return new Map((all || []).map(e => [e.name, e.id]));
  }
  console.log(`  employees: ${data.length}명`);
  return new Map(data.map(e => [e.name, e.id]));
}

function parseKorDate(v) {
  if (v instanceof Date) return v.toISOString().split('T')[0];
  const s = String(v).replace(/\./g, '-').trim();
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

// ========= 3. projects (from 사업별 지출내역) =========
async function seedProjects(monthId) {
  console.log('--- projects ---');
  const ws = getSheet('사업별 지출내역');
  const projects = [];

  const fundTypeMap = {
    '운영비 계좌(기업은행)': { fund_source: '운영비 계좌(기업은행)', fund_type: '운영비' },
    '보탬e': { fund_source: '보탬e', fund_type: '국비' },
    'E-나라도움': { fund_source: 'E-나라도움', fund_type: '국비' },
    'RCMS': { fund_source: 'RCMS', fund_type: '국비' },
    '계좌이체(기업은행)': { fund_source: '계좌이체(기업은행)', fund_type: '시비' },
  };

  for (let r = 5; r <= 56; r++) {
    const name = cellVal(ws, `A${r}`);
    if (!name || name === '합계' || name === '총합계') continue;
    const note = cellVal(ws, `L${r}`) || '';
    const isSub = cellVal(ws, `M${r}`) === '대체집행';
    const fi = fundTypeMap[note] || { fund_source: note, fund_type: null };

    // 이름에서 fund_type 추론
    let ft = fi.fund_type;
    if (name.includes('_국비')) ft = '국비';
    else if (name.includes('_도비')) ft = '도비';
    else if (name.includes('_군비')) ft = '군비';
    else if (name.includes('_시비')) ft = '시비';

    projects.push({
      name,
      short_name: name.length > 15 ? name.substring(0, 15) + '...' : name,
      fund_source: fi.fund_source,
      fund_type: ft,
      is_substitute: isSub,
      is_active: true,
    });
  }

  const { data, error } = await supabase.from('projects').insert(projects).select();
  if (error) {
    console.error('project insert error:', error);
    // 개별 삽입
    for (const p of projects) {
      await supabase.from('projects').insert(p);
    }
    const { data: all } = await supabase.from('projects').select('*');
    console.log(`  projects: ${all?.length || 0}개`);
    return new Map((all || []).map(p => [p.name, p.id]));
  }
  console.log(`  projects: ${data.length}개`);
  return new Map(data.map(p => [p.name, p.id]));
}

// ========= 4. payroll_details (총괄 시트) =========
async function seedPayrollDetails(monthId, empMap) {
  console.log('--- payroll_details ---');
  const ws = getSheet('총괄');
  const rows = [];

  for (let r = 9; r <= 100; r++) {
    const name = cellVal(ws, `A${r}`);
    if (!name || name === '합계' || name === '총합계') break;
    const eid = empMap.get(name);
    if (!eid) { console.log(`  SKIP payroll: ${name}`); continue; }

    rows.push({
      payroll_month_id: monthId,
      employee_id: eid,
      monthly_salary: num(cellVal(ws, `B${r}`)),
      base_pay: num(cellVal(ws, `C${r}`)),
      position_allowance: num(cellVal(ws, `D${r}`)),
      transport: num(cellVal(ws, `E${r}`)),
      meal: num(cellVal(ws, `F${r}`)),
      childcare: num(cellVal(ws, `G${r}`)),
      nontax_subtotal: num(cellVal(ws, `H${r}`)),
      gross_total: num(cellVal(ws, `I${r}`)),
      overtime_pay: num(cellVal(ws, `J${r}`)),
      other_pay: num(cellVal(ws, `K${r}`)),
      pay_total: num(cellVal(ws, `L${r}`)),
    });
  }

  const { error } = await supabase.from('payroll_details').insert(rows);
  if (error) console.error('payroll_details:', error);
  else console.log(`  payroll_details: ${rows.length}건`);
}

// ========= 5. personal_deductions (개인공제 시트) =========
async function seedDeductions(monthId, empMap) {
  console.log('--- personal_deductions ---');
  const ws = getSheet('개인공제');
  const rows = [];

  for (let r = 8; r <= 110; r++) {
    const name = cellVal(ws, `A${r}`);
    if (!name || name === '합계' || name === '총합계') break;
    const eid = empMap.get(name);
    if (!eid) { console.log(`  SKIP deduction: ${name}`); continue; }

    rows.push({
      payroll_month_id: monthId,
      employee_id: eid,
      national_pension: num(cellVal(ws, `F${r}`)),
      health_insurance: num(cellVal(ws, `G${r}`)),
      long_term_care: num(cellVal(ws, `H${r}`)),
      employment_insurance: num(cellVal(ws, `I${r}`)),
      insurance_subtotal: num(cellVal(ws, `J${r}`)),
      income_tax: num(cellVal(ws, `K${r}`)),
      resident_tax: num(cellVal(ws, `L${r}`)),
      tax_subtotal: num(cellVal(ws, `M${r}`)),
      science_fund: num(cellVal(ws, `N${r}`)),
      total_deduction: num(cellVal(ws, `O${r}`)),
      net_pay: num(cellVal(ws, `P${r}`)),
    });
  }

  const { error } = await supabase.from('personal_deductions').insert(rows);
  if (error) console.error('personal_deductions:', error);
  else console.log(`  personal_deductions: ${rows.length}건`);
}

// ========= 6. employer_contributions (기관부담 시트) =========
async function seedEmployerContributions(monthId, empMap) {
  console.log('--- employer_contributions ---');
  const ws = getSheet('기관부담');
  const rows = [];

  for (let r = 8; r <= 102; r++) {
    const name = cellVal(ws, `A${r}`);
    if (!name || name === '합계' || name === '총합계') break;
    const eid = empMap.get(name);
    if (!eid) { console.log(`  SKIP employer: ${name}`); continue; }

    rows.push({
      payroll_month_id: monthId,
      employee_id: eid,
      national_pension: num(cellVal(ws, `C${r}`)),
      health_insurance: num(cellVal(ws, `D${r}`)),
      long_term_care: num(cellVal(ws, `E${r}`)),
      employment_insurance: num(cellVal(ws, `F${r}`)),
      industrial_accident: num(cellVal(ws, `G${r}`)),
      insurance_subtotal: num(cellVal(ws, `H${r}`)),
      retirement_pension: num(cellVal(ws, `I${r}`)),
      total: num(cellVal(ws, `J${r}`)),
    });
  }

  const { error } = await supabase.from('employer_contributions').insert(rows);
  if (error) console.error('employer_contributions:', error);
  else console.log(`  employer_contributions: ${rows.length}건`);
}

// ========= 7. project_expenditures (사업별 지출내역) =========
async function seedExpenditures(monthId, projMap) {
  console.log('--- project_expenditures ---');
  const ws = getSheet('사업별 지출내역');
  const rows = [];

  for (let r = 5; r <= 56; r++) {
    const name = cellVal(ws, `A${r}`);
    if (!name || name === '합계' || name === '총합계') continue;
    const pid = projMap.get(name);
    if (!pid) { console.log(`  SKIP expenditure: ${name}`); continue; }

    rows.push({
      payroll_month_id: monthId,
      project_id: pid,
      salary: num(cellVal(ws, `B${r}`)),
      overtime: num(cellVal(ws, `C${r}`)),
      science_fund: num(cellVal(ws, `D${r}`)),
      insurance_personal: num(cellVal(ws, `E${r}`)),
      withholding_tax: num(cellVal(ws, `F${r}`)),
      net_pay: num(cellVal(ws, `G${r}`)),
      employer_insurance: num(cellVal(ws, `H${r}`)),
      employer_retirement: num(cellVal(ws, `I${r}`)),
      employer_subtotal: num(cellVal(ws, `J${r}`)),
      total: num(cellVal(ws, `K${r}`)),
      note: cellVal(ws, `L${r}`) || null,
    });
  }

  const { error } = await supabase.from('project_expenditures').insert(rows);
  if (error) console.error('project_expenditures:', error);
  else console.log(`  project_expenditures: ${rows.length}건`);
}

// ========= 8. project_assignments (사업별 시트) =========
async function seedAssignments(monthId, empMap, projMap) {
  console.log('--- project_assignments ---');
  const sheetProjectMap = {
    '운영비': '산학융합원 운영���',
    '운영비_퇴사자 정산': '산학융합원 운영비_퇴사자',
    '화학물질 환경안전': '화학물질 환경안전(ESH) 패키지 지원사업',
    '자유무역': '군산-김제 자유무역지역 역량강화 기업지원사업',
    '스마트제조(대체집행)': '전북전주 스마트제조 고급인력양성사업',
    '강소기업(대체집행)': '군산형 유망강소기업육성지원사업',
    '특수분야': '특수분야 전문인력 집중육성사업',
    '친환경 선박': '친환경 스마트 선박 기술지원 육성사업',
    '25년 군산의봄': '25년 군산의봄',
    '25년 그린산업': "25년 \u2018그린산업 육성\u2019청년일자리사업",
    '고용특구_국비': '새만금고용특구 일자리사업_국비',
    '고용특구_도비': '새만금고용특구 일자리사업_도비',
    '김제일자리센터': '김제일자리센터',
    '김제 퀵스타트': '한국형 퀵스타트 프로그램(김제)',
    '완주 퀵스타트': '한국형 퀵스타트 프로그��_국비(완주)',
    '완주 신중년_도비': '완주군 신중년 RE-START PLUS 지원사업(도비)',
    '완주 신중년_군비': '완주군 신중년 RE-START PLUS 지원사업(군비)',
    '남원형 퀵스타트': '남원형 퀵스타트',
    '식품센터_국비': '전북식품산업일자리센터',
    '고용혁신 Safe-Up_국비': 'Safe-Up PLUS / Work-Up 지원사업',
    '전주 에너지플랫폼(대체집행)': '전북전주 스마트에너지플랫폼 구축지원사업',
    '직업계고 2차(대체집행)': '직업계고 2차(대체집행)',
    '고창잡센터_국비': '고창잡센터_국비',
    '고창잡센터_군비': '고창잡센터_군비',
    '고창재도약_도비': '고창재도약_도비',
    '부안잡센터_국비': '부안잡센터_국비',
    '부안잡센터_군비': '부안잡센터_군비',
    '농촌중개인력': '농촌중개인력',
    '부안군 기업활성화_도비': '부안군 기업활성화_도비',
    '완주잡센터_국비': '완주잡센터_국비',
    '완주잡센터_도비': '완주잡센터_도비',
    '진안잡센터_국비': '진안잡센터_국비',
    '무주잡센터_국비': '무주잡센터_국비',
    '무주잡센터_군비': '무주잡센터_군비',
    '장수잡센터_국비': '장수잡센터_국비',
    '임실잡센터_국비': '임실잡센터_국비',
    '임실잡센터_군비': '임실잡센터_군비',
    '김제일자리센터': '김제일자리센터',
  };

  // 사업별 지출내역에 없는 사업은 직접 등록
  const allProjNames = new Set(projMap.keys());
  const projectSheets = wb.SheetNames.filter(n =>
    !['산재 고용보험', '건강 요양보험', '국민연금', '사업별 지출내역', '총괄', '개인공제', '기관부담', '초과근무수당', '3월 초과근무대장'].includes(n)
  );

  // 매핑에 없는 사업 자동 추가
  for (const sn of projectSheets) {
    const projName = sheetProjectMap[sn] || sn;
    if (!allProjNames.has(projName)) {
      const { data } = await supabase.from('projects').insert({ name: projName, is_active: true }).select();
      if (data && data[0]) {
        projMap.set(projName, data[0].id);
        allProjNames.add(projName);
      }
    }
  }

  const rows = [];
  for (const sn of projectSheets) {
    const ws = getSheet(sn);
    if (!ws) continue;
    const projName = sheetProjectMap[sn] || sn;
    const pid = projMap.get(projName);
    if (!pid) { console.log(`  SKIP project sheet: ${sn}`); continue; }

    const workDays = num(cellVal(ws, `N6`)) || 31;

    for (let r = 7; r <= 30; r++) {
      const rawName = cellVal(ws, `A${r}`);
      if (!rawName || rawName === '합계') break;
      const cleanName = rawName.replace(/\(.*\)/, '').trim();
      const eid = empMap.get(cleanName) || empMap.get(rawName);
      if (!eid) { console.log(`  SKIP assignment: ${rawName} in ${sn}`); continue; }

      const rate = Number(cellVal(ws, `B${r}`)) || 0;

      rows.push({
        payroll_month_id: monthId,
        project_id: pid,
        employee_id: eid,
        participation_rate: rate,
        work_days: num(cellVal(ws, `N${r}`)) || workDays,
        salary_amount: num(cellVal(ws, `C${r}`)),
        overtime_amount: num(cellVal(ws, `D${r}`)),
        science_fund: num(cellVal(ws, `E${r}`)),
        insurance_deduction: num(cellVal(ws, `F${r}`)),
        income_tax: num(cellVal(ws, `G${r}`)),
        resident_tax: num(cellVal(ws, `H${r}`)),
        tax_subtotal: num(cellVal(ws, `I${r}`)),
        net_pay: num(cellVal(ws, `J${r}`)),
        employer_insurance: num(cellVal(ws, `K${r}`)),
        employer_retirement: num(cellVal(ws, `L${r}`)),
        total_cost: num(cellVal(ws, `M${r}`)),
      });
    }
  }

  // 배치 삽입 (50개씩)
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from('project_assignments').insert(batch);
    if (error) console.error(`  assignment batch ${i}:`, error.message);
  }
  console.log(`  project_assignments: ${rows.length}건`);
}

// ========= 9. overtime_summary (초과근무수당 시트) =========
async function seedOvertimeSummary(monthId, empMap) {
  console.log('--- overtime_summary ---');
  const ws = getSheet('초과근무수당');
  if (!ws) return;
  const rows = [];

  for (let r = 3; r <= 67; r++) {
    const name = cellVal(ws, `A${r}`);
    if (!name || name === '합계') continue;
    const eid = empMap.get(name);
    if (!eid) continue;

    const projName = cellVal(ws, `B${r}`) || '';
    const hourlyRate = Number(cellVal(ws, `C${r}`)) || 0;
    const baseRate = Number(cellVal(ws, `H${r}`)) || 0;
    const approvedHours = Number(cellVal(ws, `N${r}`)) || 0;
    const overtimePay = num(cellVal(ws, `F${r}`));

    // 총 시간 파싱 (H:MM:SS or "X시간Y분")
    const totalRaw = cellVal(ws, `D${r}`);
    let totalHours = 0;
    if (totalRaw instanceof Date) {
      // Excel duration
      totalHours = totalRaw.getHours ? totalRaw.getHours() + totalRaw.getMinutes() / 60 : 0;
    } else if (typeof totalRaw === 'string') {
      const m = totalRaw.match(/(\d+):(\d+)/);
      if (m) totalHours = parseInt(m[1]) + parseInt(m[2]) / 60;
    }

    rows.push({
      payroll_month_id: monthId,
      employee_id: eid,
      project_name: projName,
      hourly_rate: hourlyRate,
      base_hourly_rate: baseRate,
      total_hours: Math.round(totalHours * 100) / 100,
      approved_hours: approvedHours,
      overtime_pay: overtimePay,
    });
  }

  const { error } = await supabase.from('overtime_summary').insert(rows);
  if (error) console.error('overtime_summary:', error);
  else console.log(`  overtime_summary: ${rows.length}건`);
}

// ========= 10. overtime_records (3월 초과근무대장) =========
async function seedOvertimeRecords(monthId, empMap) {
  console.log('--- overtime_records ---');
  const ws = getSheet('3월 초과근무대장');
  if (!ws) return;
  const rows = [];

  let currentName = null;
  for (let r = 4; r <= 227; r++) {
    const nameCell = cellVal(ws, `B${r}`);
    if (nameCell && typeof nameCell === 'string' && nameCell.trim()) {
      currentName = nameCell.trim();
    }

    const workDate = cellVal(ws, `A${r}`);
    if (!workDate || !currentName) continue;

    const eid = empMap.get(currentName);
    if (!eid) continue;

    const dateStr = workDate instanceof Date
      ? workDate.toISOString().split('T')[0]
      : null;
    if (!dateStr) continue;

    const clockIn = cellVal(ws, `C${r}`);
    const clockOut = cellVal(ws, `D${r}`);
    const inType = cellVal(ws, `E${r}`) || null;
    const outType = cellVal(ws, `F${r}`) || null;
    const overtime = cellVal(ws, `G${r}`);
    const approved = cellVal(ws, `H${r}`);
    const note = cellVal(ws, `I${r}`) || null;

    function fmtDuration(v) {
      if (!v) return null;
      if (v instanceof Date) {
        const h = v.getHours();
        const m = v.getMinutes();
        return `${h}:${String(m).padStart(2, '0')}`;
      }
      return String(v);
    }

    function fmtTimestamp(v, dateBase) {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString();
      return null;
    }

    rows.push({
      payroll_month_id: monthId,
      employee_id: eid,
      work_date: dateStr,
      clock_in: fmtTimestamp(clockIn, dateStr),
      clock_out: fmtTimestamp(clockOut, dateStr),
      in_type: inType,
      out_type: outType,
      overtime_duration: fmtDuration(overtime),
      approved_duration: fmtDuration(approved),
      note,
    });
  }

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from('overtime_records').insert(batch);
    if (error) console.error(`  records batch ${i}:`, error.message);
  }
  console.log(`  overtime_records: ${rows.length}건`);
}

// ========= MAIN =========
async function main() {
  console.log('=== 인건비 데이터 시딩 시작 ===\n');

  const monthId = await seedPayrollMonth();
  if (!monthId) { console.error('monthId 생성 실패'); return; }

  const empMap = await seedEmployees(monthId);
  const projMap = await seedProjects(monthId);

  await seedPayrollDetails(monthId, empMap);
  await seedDeductions(monthId, empMap);
  await seedEmployerContributions(monthId, empMap);
  await seedExpenditures(monthId, projMap);
  await seedAssignments(monthId, empMap, projMap);
  await seedOvertimeSummary(monthId, empMap);
  await seedOvertimeRecords(monthId, empMap);

  console.log('\n=== 시딩 완료 ===');
}

main().catch(console.error);
