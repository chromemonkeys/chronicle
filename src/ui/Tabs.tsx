type TabDef<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  tabs: TabDef<T>[];
  active: T;
  onTabChange: (id: T) => void;
  className?: string;
};

export function Tabs<T extends string>({ tabs, active, onTabChange, className = "" }: Props<T>) {
  return (
    <div className={`cm-panel-tabs ${className}`.trim()} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`cm-panel-tab ${active === tab.id ? "active" : ""}`}
          onClick={() => onTabChange(tab.id)}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
        >
          {tab.label}
          {tab.count != null && <span className="cm-panel-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
