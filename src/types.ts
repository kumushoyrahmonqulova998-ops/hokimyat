export type RoleSlug = 'super_admin' | 'admin_one' | 'admin_two' | 'mahalla';
export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  phone: string;
  email: string;
  roleSlug: RoleSlug;
  roleName: string;
  mahallaId: number | null;
  mahallaName: string | null;
  mahallaCode: string | null;
  mustChangePassword: boolean;
  permissions: string[];
  assignedDirectionIds: number[];
  csrfToken: string;
}

export interface MahallaItem {
  id: number;
  code: string;
  name: string;
  sector: string;
  population_base?: number;
  is_active?: number;
}

export interface DirectionItem {
  id: number;
  sort_order: number;
  slug: string;
  name: string;
  short_name: string;
  description: string;
  icon: string;
  indicator_count?: number;
  approved_sum?: number;
  pending_count?: number;
  last_updated_at?: string | null;
}

export interface IndicatorItem {
  id: number;
  direction_id: number;
  code: string;
  name: string;
  unit: string;
  value_type: 'integer' | 'decimal' | 'currency' | 'percent';
}

export interface KpiCard {
  key: string;
  title: string;
  unit: string;
  currentValue: number;
  pendingDelta: number;
  previousValue: number;
  changePercent: number;
  lastUpdatedAt: string | null;
  sparkline: Array<{ label: string; value: number }>;
}

export interface DashboardPayload {
  periodType: PeriodType;
  periodLabel: string;
  kpis: KpiCard[];
  liveUpdates: {
    lastUpdatedDisplay: string;
    activeDate: string;
    directionsUpdated: number;
    mahallasUpdated: number;
    pendingApprovals: number;
    totalDelta: number;
  };
  dailyActivity: Array<{
    id: number;
    old_value: number;
    new_value: number;
    difference: number;
    changed_at: string;
    source: string;
    approval_status: string;
    comment: string;
    indicator_name: string;
    unit: string;
    direction_name: string;
    direction_slug: string;
    mahalla_name: string;
    changed_by_name: string;
  }>;
  charts: {
    populationFamilies: { labels: string[]; series: Record<string, number[]> };
    socialRegistry: { labels: string[]; series: Record<string, number[]> };
    employment: { labels: string[]; series: Record<string, number[]> };
    subsidiesMedicalEducation: { labels: string[]; series: Record<string, number[]> };
    funds: { labels: string[]; series: Record<string, number[]> };
    mahallaComparison: Array<{
      id: number;
      name: string;
      sector: string;
      aholi: number;
      bandlar: number;
      ishsizlar: number;
      reyestr: number;
      mab_ajratilgan: number;
      mab_sarflangan: number;
      employmentPercent: number;
      fundPercent: number;
    }>;
  };
  directions: DirectionItem[];
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: number;
  link: string;
  created_at: string;
}
