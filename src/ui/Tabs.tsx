import type { KeyboardEvent, ReactNode } from "react";

type TabDef<T extends string> = {
  id: T;
  label: string;
  ariaLabel?: string;
  count?: number;
  icon?: ReactNode;
};

type Props<T extends string> = {
  tabs: TabDef<T>[];
  active: T;
  onTabChange: (id: T) => void;
  className?: string;
  orientation?: "horizontal" | "vertical";
};

export function Tabs<T extends string>({
  tabs,
  active,
  onTabChange,
  className = "",
  orientation = "horizontal"
}: Props<T>) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (tabs.length === 0) {
      return;
    }
    let nextIndex = index;
    if (event.key === "ArrowRight" || (orientation === "vertical" && event.key === "ArrowDown")) {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || (orientation === "vertical" && event.key === "ArrowUp")) {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return;
    }
    onTabChange(nextTab.id);
    const selector = `[role="tab"][data-tab-id="${String(nextTab.id)}"]`;
    const target = document.querySelector<HTMLButtonElement>(selector);
    target?.focus();
  }

  return (
    <div
      className={`cm-panel-tabs ${className}`.trim()}
      role="tablist"
      aria-orientation={orientation}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          className={`cm-panel-tab ${active === tab.id ? "active" : ""}`}
          onClick={() => onTabChange(tab.id)}
          type="button"
          role="tab"
          aria-label={tab.ariaLabel ?? tab.label}
          title={tab.ariaLabel ?? tab.label}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          data-tab-id={String(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.icon ? <span className="cm-panel-tab-icon" aria-hidden="true">{tab.icon}</span> : null}
          <span className="cm-panel-tab-label">{tab.label}</span>
          {(tab.count ?? 0) > 0 && <span className="cm-panel-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
