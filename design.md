# ApexFix POS & CRM - Design System Tokens

## 1. Typography
- **UI & Headings:** `Inter`, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Data, Numbers, Currency & IMEIs:** `JetBrains Mono`, monospace
- **Type Scale:**
  - `headline-xl`: 32px / 40px, font-bold, -0.025em
  - `headline-lg`: 24px / 32px, font-semibold, -0.02em
  - `headline-md`: 18px / 26px, font-semibold, -0.015em
  - `body-md`: 14px / 20px, font-normal
  - `body-sm`: 12px / 18px, font-normal
  - `label-numeric`: 14px / 18px, font-semibold, font-mono
  - `label-code`: 12px / 16px, font-medium, font-mono
  - `label-caps`: 11px / 14px, font-semibold, uppercase, tracking-wider

## 2. Color Palette
- **Brand Primary:** `#4f46e5` (Indigo 600)
- **Brand Hover:** `#4338ca` (Indigo 700)
- **Brand Active:** `#3730a3` (Indigo 800)
- **Brand Soft:** `#eef2ff` (Indigo 50)
- **Brand Border:** `#c7d2fe` (Indigo 200)

### Surfaces
- **Canvas / Background:** `#f8fafc` (Slate 50)
- **Card / Surface Lowest:** `#ffffff` (White)
- **Card Hover:** `#f1f5f9` (Slate 100)
- **Border Default:** `#e2e8f0` (Slate 200)
- **Border Subtle:** `#f1f5f9` (Slate 100)

### Status Indicators
- **In Progress:**
  - Badge: `bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-600/10`
  - Dot: `bg-blue-500 animate-pulse`
  - Icon: `clock-3` / `loader`
- **Waiting on Parts:**
  - Badge: `bg-amber-50 text-amber-800 border-amber-200 ring-1 ring-amber-600/10`
  - Dot: `bg-amber-500`
  - Icon: `package-search` / `package`
- **Completed / Ready:**
  - Badge: `bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-600/10`
  - Dot: `bg-emerald-500`
  - Icon: `check-circle-2`
- **Pending / New:**
  - Badge: `bg-slate-100 text-slate-700 border-slate-200 ring-1 ring-slate-600/10`
  - Dot: `bg-slate-500`
  - Icon: `alert-circle`

## 3. Financial Display Rule
- **Primary Display:** Total Amount Inc. Tax (`$146.90`) in bold font-mono
- **Secondary Display:** Pre-tax subtotal (`Pre-tax: $130.00`) in slate-400 font-mono text-[11px]
- **Tender Status:** Paid in Full (Emerald pill) vs. Balance Due (Amber/Red pill)
