/**
 * Canadian (Ontario) Payroll Calculation Engine (2026 CRA / Ministry of Finance Compliant)
 * All monetary amounts are computed and returned in integer CENTS ($1.00 = 100 cents).
 */

export interface EmployeeCompensationInput {
  hourlyRateCents: number;
  overtimeRateCents?: number | null;
  vacationPayPct?: number; // basis points, e.g. 400 = 4.0%
  td1FederalClaimCents?: number; // 2026 default: $16,129 (1612900 cents)
  td1OntarioClaimCents?: number; // 2026 default: $12,746 (1274600 cents)
}

export interface PayrollCalculationInput {
  regularHours: number;
  overtimeHours: number;
  bonusCents?: number;
  otherDeductionsCents?: number;
  periodType: 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'CUSTOM';
  daysInPeriod?: number;
  employee: EmployeeCompensationInput;
}

export interface PayrollCalculationResult {
  regularHours: number;
  overtimeHours: number;
  hourlyRateCents: number;
  overtimeRateCents: number;
  regularPayCents: number;
  overtimePayCents: number;
  bonusCents: number;
  vacationPayCents: number;
  grossPayCents: number;
  cppCents: number;
  eiCents: number;
  incomeTaxCents: number;
  otherDeductionsCents: number;
  totalDeductionsCents: number;
  netPayCents: number;
  payPeriodsPerYear: number;
  effectiveTaxRatePct: number;
}

// 2026 CRA & Ontario Statutory Constants
export const CRA_2026 = {
  CPP: {
    RATE: 0.0595, // 5.95% employee contribution
    BASIC_EXEMPTION_ANNUAL_CENTS: 350000, // $3,500.00
    YMPE_ANNUAL_CENTS: 7130000, // $71,300.00 max pensionable earnings
    MAX_ANNUAL_CONTRIBUTION_CENTS: 403410, // ($71,300 - $3,500) * 5.95% = $4,034.10
  },
  EI: {
    RATE: 0.0163, // 1.63% employee rate for 2026
    MAX_INSURABLE_ANNUAL_CENTS: 6570000, // $65,700.00 max insurable earnings
    MAX_ANNUAL_PREMIUM_CENTS: 107091, // $1,070.91 max annual premium
  },
  DEFAULT_TD1_FEDERAL_CENTS: 1612900, // $16,129 basic personal amount
  DEFAULT_TD1_ONTARIO_CENTS: 1274600, // $12,746 Ontario basic claim
  ONTARIO_VACATION_PAY_BPS: 400, // 4.00%
  ONTARIO_OVERTIME_WEEKLY_HOURS: 44.0, // Overtime starts after 44 hours/week in Ontario
};

/**
 * Determine periods per year based on pay frequency
 */
export function getPeriodsPerYear(periodType: string, days = 14): number {
  switch (periodType) {
    case 'WEEKLY':
      return 52;
    case 'BI_WEEKLY':
      return 26;
    case 'MONTHLY':
      return 12;
    case 'CUSTOM':
      return Math.max(1, Math.round(365 / Math.max(1, days)));
    default:
      return 26;
  }
}

export function calculateShiftHours(shiftMinutes: number, priorWeeklyMinutes: number) {
  const otThresholdMinutes = CRA_2026.ONTARIO_OVERTIME_WEEKLY_HOURS * 60; // 2,640 mins (44h)
  const totalMinutesAfterShift = priorWeeklyMinutes + shiftMinutes;

  if (totalMinutesAfterShift <= otThresholdMinutes) {
    return { regularMinutes: shiftMinutes, overtimeMinutes: 0 };
  } else if (priorWeeklyMinutes >= otThresholdMinutes) {
    return { regularMinutes: 0, overtimeMinutes: shiftMinutes };
  } else {
    const regularMinutes = otThresholdMinutes - priorWeeklyMinutes;
    const overtimeMinutes = shiftMinutes - regularMinutes;
    return { regularMinutes, overtimeMinutes };
  }
}

/**
 * Compute Canada Pension Plan (CPP) periodic contribution
 */
export function calculateCPP(grossCents: number, periodsPerYear: number): number {
  if (grossCents <= 0) return 0;
  const periodicExemption = Math.round(CRA_2026.CPP.BASIC_EXEMPTION_ANNUAL_CENTS / periodsPerYear);
  const contributoryGross = Math.max(0, grossCents - periodicExemption);
  if (contributoryGross <= 0) return 0;

  const rawCpp = Math.round(contributoryGross * CRA_2026.CPP.RATE);
  const periodicMax = Math.round(CRA_2026.CPP.MAX_ANNUAL_CONTRIBUTION_CENTS / periodsPerYear);
  return Math.min(rawCpp, periodicMax);
}

/**
 * Compute Employment Insurance (EI) periodic premium
 */
export function calculateEI(grossCents: number, periodsPerYear: number): number {
  if (grossCents <= 0) return 0;
  const rawEi = Math.round(grossCents * CRA_2026.EI.RATE);
  const periodicMax = Math.round(CRA_2026.EI.MAX_ANNUAL_PREMIUM_CENTS / periodsPerYear);
  return Math.min(rawEi, periodicMax);
}

/**
 * Calculate Canadian Federal Income Tax on Annualized Income (2026 brackets)
 */
function calculateAnnualFederalTax(annualIncomeCents: number, td1FedCents: number): number {
  const inc = annualIncomeCents / 100;
  if (inc <= 0) return 0;

  let tax = 0;
  if (inc <= 55867) {
    tax = inc * 0.15;
  } else if (inc <= 111733) {
    tax = 55867 * 0.15 + (inc - 55867) * 0.205;
  } else if (inc <= 173205) {
    tax = 55867 * 0.15 + (111733 - 55867) * 0.205 + (inc - 111733) * 0.26;
  } else if (inc <= 246752) {
    tax = 55867 * 0.15 + (111733 - 55867) * 0.205 + (173205 - 111733) * 0.26 + (inc - 173205) * 0.29;
  } else {
    tax = 55867 * 0.15 + (111733 - 55867) * 0.205 + (173205 - 111733) * 0.26 + (246752 - 173205) * 0.29 + (inc - 246752) * 0.33;
  }

  // Federal Non-refundable basic tax credit: 15% of TD1 claim
  const credit = (td1FedCents / 100) * 0.15;
  return Math.max(0, Math.round((tax - credit) * 100));
}

/**
 * Calculate Ontario Provincial Income Tax on Annualized Income (2026 brackets + surtax + OHP)
 */
function calculateAnnualOntarioTax(annualIncomeCents: number, td1OnCents: number): number {
  const inc = annualIncomeCents / 100;
  if (inc <= 0) return 0;

  // Base Ontario Tax Brackets
  let baseTax = 0;
  if (inc <= 51446) {
    baseTax = inc * 0.0505;
  } else if (inc <= 102894) {
    baseTax = 51446 * 0.0505 + (inc - 51446) * 0.0915;
  } else if (inc <= 150000) {
    baseTax = 51446 * 0.0505 + (102894 - 51446) * 0.0915 + (inc - 102894) * 0.1116;
  } else if (inc <= 220000) {
    baseTax = 51446 * 0.0505 + (102894 - 51446) * 0.0915 + (150000 - 102894) * 0.1116 + (inc - 150000) * 0.1216;
  } else {
    baseTax = 51446 * 0.0505 + (102894 - 51446) * 0.0915 + (150000 - 102894) * 0.1116 + (220000 - 150000) * 0.1216 + (inc - 220000) * 0.1316;
  }

  // Ontario Non-refundable tax credit: 5.05% of TD1 Ontario claim
  const credit = (td1OnCents / 100) * 0.0505;
  let netBaseTax = Math.max(0, baseTax - credit);

  // Ontario Surtax: 20% over $5,315 + 36% over $6,802
  let surtax = 0;
  if (netBaseTax > 5315) {
    surtax += (netBaseTax - 5315) * 0.20;
  }
  if (netBaseTax > 6802) {
    surtax += (netBaseTax - 6802) * 0.36;
  }

  // Ontario Health Premium (OHP)
  let ohp = 0;
  if (inc > 20000 && inc <= 25000) {
    ohp = Math.min(300, (inc - 20000) * 0.06);
  } else if (inc > 25000 && inc <= 36000) {
    ohp = 300;
  } else if (inc > 36000 && inc <= 38500) {
    ohp = 300 + (inc - 36000) * 0.06;
  } else if (inc > 38500 && inc <= 48000) {
    ohp = 450;
  } else if (inc > 48000 && inc <= 48600) {
    ohp = 450 + (inc - 48000) * 0.25;
  } else if (inc > 48600 && inc <= 72000) {
    ohp = 600;
  } else if (inc > 72000 && inc <= 72600) {
    ohp = 600 + (inc - 72000) * 0.25;
  } else if (inc > 72600 && inc <= 200000) {
    ohp = 750;
  } else if (inc > 200000 && inc <= 200600) {
    ohp = 750 + (inc - 200000) * 0.25;
  } else if (inc > 200600) {
    ohp = 900;
  }

  return Math.round((netBaseTax + surtax + ohp) * 100);
}

/**
 * Compute combined Federal and Ontario periodic income tax
 */
export function calculateIncomeTax(
  grossCents: number,
  periodsPerYear: number,
  td1FedCents = CRA_2026.DEFAULT_TD1_FEDERAL_CENTS,
  td1OnCents = CRA_2026.DEFAULT_TD1_ONTARIO_CENTS
): number {
  if (grossCents <= 0) return 0;
  const annualGross = grossCents * periodsPerYear;
  const annualFed = calculateAnnualFederalTax(annualGross, td1FedCents);
  const annualOn = calculateAnnualOntarioTax(annualGross, td1OnCents);
  return Math.max(0, Math.round((annualFed + annualOn) / periodsPerYear));
}

/**
 * Main Payroll Calculation Function
 */
export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const periodsPerYear = getPeriodsPerYear(input.periodType, input.daysInPeriod);
  const hourlyRateCents = Math.max(0, input.employee.hourlyRateCents);
  const overtimeRateCents = input.employee.overtimeRateCents && input.employee.overtimeRateCents > 0
    ? input.employee.overtimeRateCents
    : Math.round(hourlyRateCents * 1.5);

  const regularHours = Math.max(0, Number(input.regularHours.toFixed(2)));
  const overtimeHours = Math.max(0, Number(input.overtimeHours.toFixed(2)));

  const regularPayCents = Math.round(regularHours * hourlyRateCents);
  const overtimePayCents = Math.round(overtimeHours * overtimeRateCents);
  const bonusCents = Math.max(0, input.bonusCents || 0);

  // Ontario Vacation Pay: 4% of wages
  const vacationPayPct = input.employee.vacationPayPct ?? CRA_2026.ONTARIO_VACATION_PAY_BPS;
  const baseEarningsCents = regularPayCents + overtimePayCents + bonusCents;
  const vacationPayCents = Math.round((baseEarningsCents * vacationPayPct) / 10000);

  const grossPayCents = baseEarningsCents + vacationPayCents;

  // Statutory Canadian Deductions
  const cppCents = calculateCPP(grossPayCents, periodsPerYear);
  const eiCents = calculateEI(grossPayCents, periodsPerYear);
  const incomeTaxCents = calculateIncomeTax(
    grossPayCents,
    periodsPerYear,
    input.employee.td1FederalClaimCents || CRA_2026.DEFAULT_TD1_FEDERAL_CENTS,
    input.employee.td1OntarioClaimCents || CRA_2026.DEFAULT_TD1_ONTARIO_CENTS
  );

  const otherDeductionsCents = Math.max(0, input.otherDeductionsCents || 0);
  const totalDeductionsCents = cppCents + eiCents + incomeTaxCents + otherDeductionsCents;
  const netPayCents = Math.max(0, grossPayCents - totalDeductionsCents);

  const effectiveTaxRatePct = grossPayCents > 0
    ? Number(((totalDeductionsCents / grossPayCents) * 100).toFixed(2))
    : 0;

  return {
    regularHours,
    overtimeHours,
    hourlyRateCents,
    overtimeRateCents,
    regularPayCents,
    overtimePayCents,
    bonusCents,
    vacationPayCents,
    grossPayCents,
    cppCents,
    eiCents,
    incomeTaxCents,
    otherDeductionsCents,
    totalDeductionsCents,
    netPayCents,
    payPeriodsPerYear: periodsPerYear,
    effectiveTaxRatePct,
  };
}
