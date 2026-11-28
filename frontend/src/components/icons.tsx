import type { SVGProps } from "react";

export type IconName =
  | "logo"
  | "dashboard"
  | "box"
  | "layers"
  | "orders"
  | "users"
  | "tag"
  | "truck"
  | "wallet"
  | "chart"
  | "settings"
  | "plug"
  | "search"
  | "plus"
  | "chevronRight"
  | "chevronDown"
  | "arrowUp"
  | "arrowDown"
  | "alert"
  | "check"
  | "close"
  | "menu"
  | "logout"
  | "refresh"
  | "download"
  | "upload"
  | "trash"
  | "edit"
  | "filter"
  | "more"
  | "external"
  | "sparkle"
  | "warehouse"
  | "receipt"
  | "mail"
  | "phone"
  | "globe"
  | "clock"
  | "shield"
  | "copy"
  | "chevronLeft"
  | "calendar"
  | "printer"
  | "palette"
  | "key"
  | "building"
  | "sliders"
  | "lock"
  | "info"
  | "folder"
  | "award";

const paths: Record<IconName, React.ReactNode> = {
  logo: (
    <>
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.6" />
      <rect x="14" y="3" width="7" height="5" rx="1.6" />
      <rect x="14" y="12" width="7" height="9" rx="1.6" />
      <rect x="3" y="15" width="7" height="6" rx="1.6" />
    </>
  ),
  box: (
    <>
      <path d="M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2V8.2Z" />
      <path d="m3.4 8.4 8.6 4.9 8.6-4.9M12 13.3V21" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2.8 9 4.7-9 4.7-9-4.7 9-4.7Z" />
      <path d="m3 12.1 9 4.7 9-4.7M3 16.7l9 4.7 9-4.7" />
    </>
  ),
  orders: (
    <>
      <path d="M6 2.8h9l3 3V21l-3-2-3 2-3-2-3 2V2.8Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.6" />
      <path d="M18.5 20v-1.6a4 4 0 0 0-3-3.7M16.5 3.5a3.5 3.5 0 0 1 0 6.8" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.3 13 20.9a2 2 0 0 1-2.8 0L3 13.7V4h9.7l7.9 7.9a2 2 0 0 1 0 1.4Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  truck: (
    <>
      <path d="M1.8 5.5h12.5v11H1.8zM14.3 9.3h3.6l3.3 3.4v3.8h-6.9" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17.5" cy="18" r="2" />
    </>
  ),
  wallet: (
    <>
      <path d="M20.5 7.5V19a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5Z" />
      <path d="M1.5 8h19M16 13.5h3" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15.5 11 11l3.2 3.2L20 7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.5v-.1A1.7 1.7 0 0 0 8.4 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.5h.1A1.7 1.7 0 0 0 3.7 8.4a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.16 3.6l.06.06A1.7 1.7 0 0 0 8.1 4a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4.1v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19 8.1a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.1h-.1a1.7 1.7 0 0 0-1.5 1.4Z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2.5v6M15 2.5v6M6 8.5h12v3a6 6 0 0 1-12 0v-3ZM12 17.5V22" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.8" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7" />,
  alert: (
    <>
      <path d="M10.3 3.5 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  check: <path d="m4 12.5 5 5L20 6.5" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  logout: (
    <>
      <path d="M9 21H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 11a8.5 8.5 0 1 0-2.1 6.4" />
      <path d="M20.5 4v7h-7" />
    </>
  ),
  download: <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" />,
  upload: <path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 20h16" />,
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" />,
  warehouse: (
    <>
      <path d="M3 21V8l9-5 9 5v13M3 21h18" />
      <path d="M7 21v-8h10v8M7 17h10" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-2.3-1.5L14.4 21l-2.4-1.5L9.6 21l-2.3-1.5L5 21V3Z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  phone: <path d="M21 16.5v2.8a1.7 1.7 0 0 1-1.9 1.7 18 18 0 0 1-7.8-2.8 17.7 17.7 0 0 1-5.5-5.5A18 18 0 0 1 3 4.9 1.7 1.7 0 0 1 4.7 3h2.8a1.7 1.7 0 0 1 1.7 1.5c.1 1 .4 2 .7 2.9a1.7 1.7 0 0 1-.4 1.8L8.3 10.4a14.5 14.5 0 0 0 5.3 5.3l1.2-1.2a1.7 1.7 0 0 1 1.8-.4c.9.3 1.9.6 2.9.7a1.7 1.7 0 0 1 1.5 1.7Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 20 6v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6l8-3.5Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V4H4v12h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" />
    </>
  ),
  palette: (
    <>
      <circle cx="13.5" cy="6.5" r="0.8" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.8" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.8" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.6-10-8.6Z" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.8-8.8M16 7l2.5 2.5M18.5 4.5 21 7" />
    </>
  ),
  building: (
    <>
      <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9.2 13.3 8 21l4-2 4 2-1.2-7.7" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
