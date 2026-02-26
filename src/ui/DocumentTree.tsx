export type TreeItemData = {
  id: string;
  label: string;
  icon: string;
  indent?: "indent" | "indent2";
  toggle?: string;
  badge?: "changed" | "pending";
};

type Props = {
  items: TreeItemData[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
};

export function DocumentTree({ items, activeId, onSelect, className = "" }: Props) {
  return (
    <div className={`cm-doc-tree ${className}`.trim()} role="tree">
      {items.map((item) => (
        <button
          key={item.id}
          className={`cm-tree-item ${item.indent ?? ""} ${activeId === item.id ? "active" : ""}`.trim()}
          type="button"
          role="treeitem"
          aria-selected={activeId === item.id}
          aria-expanded={item.toggle === "▾" ? true : item.toggle === "▸" ? false : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.toggle != null && <span className="cm-tree-toggle">{item.toggle}</span>}
          <span className="cm-tree-icon">{item.icon}</span>
          {item.label}
          {item.badge && <span className={`cm-tree-badge ${item.badge}`} />}
        </button>
      ))}
    </div>
  );
}
