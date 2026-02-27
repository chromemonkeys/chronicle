import { useState, useCallback, useRef, useEffect } from "react";

export type DocumentStatus = "Draft" | "In review" | "Ready for approval" | "Approved";

export type TreeItemData = {
  id: string;
  label: string;
  icon?: string;
  badge?: "changed" | "pending" | "approved";
  status?: DocumentStatus;
  openThreads?: number;
  isFolder?: boolean;
  children?: TreeItemData[];
};

type Props = {
  items: TreeItemData[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreateDocument?: (folderId?: string) => void;
  onMoveDocument?: (documentId: string, targetFolderId: string) => void;
  className?: string;
  emptyMessage?: string;
  showStatusLegend?: boolean;
};

const STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string; badge: "changed" | "pending" | "approved" | undefined }> = {
  "Draft": { label: "Draft", color: "var(--ink-4)", badge: undefined },
  "In review": { label: "In review", color: "var(--yellow)", badge: "pending" },
  "Ready for approval": { label: "Ready for approval", color: "var(--accent)", badge: "changed" },
  "Approved": { label: "Approved", color: "var(--green)", badge: "approved" },
};

function StatusLegend({ onClose }: { onClose: () => void }) {
  return (
    <div className="cm-tree-legend" onMouseLeave={onClose}>
      <div className="cm-tree-legend-title">Status Indicators</div>
      {Object.entries(STATUS_CONFIG).map(([status, config]) => (
        <div key={status} className="cm-tree-legend-item">
          <span
            className="cm-tree-legend-dot"
            style={{ background: config.color }}
          />
          <span>{config.label}</span>
        </div>
      ))}
      <div className="cm-tree-legend-divider" />
      <div className="cm-tree-legend-item">
        <span className="cm-tree-badge pending" style={{ position: "static", margin: 0 }} />
        <span>Has open threads</span>
      </div>
    </div>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = window.setTimeout(() => setShow(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span
      className="cm-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && <span className="cm-tooltip">{text}</span>}
    </span>
  );
}

type TreeNodeProps = {
  item: TreeItemData;
  activeId: string;
  level: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateDocument?: (folderId?: string) => void;
  onContextMenu: (e: React.MouseEvent, itemId: string) => void;
  onDragStart: (e: React.DragEvent, itemId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, itemId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  dragOverItem: string | null;
  draggedItem: string | null;
};

function TreeNode({
  item,
  activeId,
  level,
  expanded,
  onToggle,
  onSelect,
  onCreateDocument,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dragOverItem,
  draggedItem,
}: TreeNodeProps) {
  const statusConfig = item.status ? STATUS_CONFIG[item.status] : null;
  const isDragOver = dragOverItem === item.id;
  const isDragged = draggedItem === item.id;
  const isExpanded = expanded.has(item.id);
  const hasChildren = item.children && item.children.length > 0;
  const childCount = item.children?.length ?? 0;

  const handleClick = () => {
    if (item.isFolder) {
      onToggle(item.id);
    } else {
      onSelect(item.id);
    }
  };

  return (
    <>
      <div
        className={`cm-tree-item-wrapper ${isDragOver ? "drag-over" : ""} ${isDragged ? "dragging" : ""}`}
        onDragOver={(e) => onDragOver(e, item.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, item.id)}
        style={{ paddingLeft: `${level * 16}px` }}
      >
        <button
          className={`cm-tree-item ${item.isFolder ? "folder" : ""} ${activeId === item.id ? "active" : ""}`.trim()}
          type="button"
          role={item.isFolder ? "treeitem" : undefined}
          aria-selected={!item.isFolder && activeId === item.id}
          aria-expanded={item.isFolder ? isExpanded : undefined}
          draggable={!item.isFolder}
          onDragStart={(e) => onDragStart(e, item.id)}
          onDragEnd={onDragEnd}
          onClick={handleClick}
          onContextMenu={(e) => onContextMenu(e, item.id)}
        >
          {item.isFolder && hasChildren && (
            <span className="cm-tree-toggle" onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}>
              {isExpanded ? "▾" : "▸"}
            </span>
          )}
          {item.isFolder && !hasChildren && <span className="cm-tree-toggle-placeholder" />}
          <span className="cm-tree-icon">{item.icon}</span>
          <span className="cm-tree-label" title={item.label}>
            {item.label}
          </span>
          {item.isFolder && childCount > 0 && (
            <span className="cm-tree-count">{childCount}</span>
          )}
          {item.isFolder && childCount === 0 && (
            <span className="cm-tree-empty-badge">empty</span>
          )}
          {item.badge && (
            <Tooltip
              text={
                item.openThreads && item.openThreads > 0
                  ? `${item.openThreads} open thread${item.openThreads === 1 ? "" : "s"}`
                  : statusConfig?.label || "Pending changes"
              }
            >
              <span className={`cm-tree-badge ${item.badge}`} />
            </Tooltip>
          )}
          {item.isFolder && onCreateDocument && (
            <Tooltip text="Create new document">
              <button
                className="cm-tree-add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const spaceId = item.id.startsWith("space-") ? item.id.slice(6) : item.id;
                  onCreateDocument(spaceId);
                }}
                type="button"
                aria-label={`Create document in ${item.label}`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </Tooltip>
          )}
        </button>
      </div>
      
      {/* Render children if expanded */}
      {item.isFolder && isExpanded && item.children?.map((child) => (
        <TreeNode
          key={child.id}
          item={child}
          activeId={activeId}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          onCreateDocument={onCreateDocument}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          dragOverItem={dragOverItem}
          draggedItem={draggedItem}
        />
      ))}
    </>
  );
}

export function DocumentTree({
  items,
  activeId,
  onSelect,
  onCreateDocument,
  onMoveDocument,
  className = "",
  emptyMessage = "No documents in this section.",
  showStatusLegend = true,
}: Props) {
  const [legendVisible, setLegendVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const treeRef = useRef<HTMLDivElement>(null);

  // Auto-expand folders with active document
  useEffect(() => {
    const findAndExpandParent = (items: TreeItemData[], targetId: string, parentPath: string[] = []): string[] | null => {
      for (const item of items) {
        if (item.id === targetId) {
          return parentPath;
        }
        if (item.children) {
          const found = findAndExpandParent(item.children, targetId, [...parentPath, item.id]);
          if (found) return found;
        }
      }
      return null;
    };

    const parents = findAndExpandParent(items, activeId);
    if (parents) {
      setExpanded(new Set(parents));
    }
  }, [activeId, items]);

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, itemId });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedItem && draggedItem !== itemId) {
      setDragOverItem(itemId);
    }
  }, [draggedItem]);

  const handleDragLeave = useCallback(() => {
    setDragOverItem(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId && sourceId !== targetId && onMoveDocument) {
      // Find if target is a folder
      const findItem = (items: TreeItemData[], id: string): TreeItemData | null => {
        for (const item of items) {
          if (item.id === id) return item;
          if (item.children) {
            const found = findItem(item.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      
      const targetItem = findItem(items, targetId);
      if (targetItem?.isFolder) {
        const spaceId = targetId.startsWith("space-") ? targetId.slice(6) : targetId;
        onMoveDocument(sourceId, spaceId);
      }
    }
    setDraggedItem(null);
    setDragOverItem(null);
  }, [items, onMoveDocument]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverItem(null);
  }, []);

  const handleCreateInFolder = useCallback((folderId: string) => {
    const spaceId = folderId.startsWith("space-") ? folderId.slice(6) : folderId;
    onCreateDocument?.(spaceId);
    handleCloseContextMenu();
  }, [onCreateDocument, handleCloseContextMenu]);

  const isEmpty = items.length === 0;

  // Flatten items for context menu
  const flattenItems = (items: TreeItemData[]): TreeItemData[] => {
    const result: TreeItemData[] = [];
    for (const item of items) {
      result.push(item);
      if (item.children) {
        result.push(...flattenItems(item.children));
      }
    }
    return result;
  };
  const allItems = flattenItems(items);
  const contextMenuItem = contextMenu ? allItems.find((i) => i.id === contextMenu.itemId) : null;

  return (
    <div className={`cm-doc-tree ${className}`.trim()} role="tree" ref={treeRef}>
      {showStatusLegend && (
        <div className="cm-tree-header">
          <button
            className="cm-tree-legend-btn"
            onClick={() => setLegendVisible(!legendVisible)}
            title="Show status indicators"
            aria-label="Show status indicators"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11" r="0.8" fill="currentColor" />
            </svg>
          </button>
          {legendVisible && <StatusLegend onClose={() => setLegendVisible(false)} />}
        </div>
      )}

      {isEmpty ? (
        <div className="cm-tree-empty-state">
          <div className="cm-tree-empty-icon">📂</div>
          <div className="cm-tree-empty-text">{emptyMessage}</div>
          {onCreateDocument && (
            <button
              className="cm-tree-empty-action"
              onClick={() => onCreateDocument()}
              type="button"
            >
              Create your first document
            </button>
          )}
        </div>
      ) : (
        items.map((item) => (
          <TreeNode
            key={item.id}
            item={item}
            activeId={activeId}
            level={0}
            expanded={expanded}
            onToggle={handleToggle}
            onSelect={onSelect}
            onCreateDocument={onCreateDocument}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            dragOverItem={dragOverItem}
            draggedItem={draggedItem}
          />
        ))
      )}

      {contextMenu && contextMenuItem && (
        <div
          className="cm-tree-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenuItem.isFolder ? (
            <>
              <button
                className="cm-context-item"
                onClick={() => handleCreateInFolder(contextMenu.itemId)}
                type="button"
              >
                <span>➕</span> New document
              </button>
            </>
          ) : (
            <>
              <div className="cm-context-label">Move to...</div>
              {allItems
                .filter((i) => i.isFolder && i.id !== contextMenu.itemId)
                .map((folder) => (
                  <button
                    key={folder.id}
                    className="cm-context-item"
                    onClick={() => {
                      const spaceId = folder.id.startsWith("space-") ? folder.id.slice(6) : folder.id;
                      onMoveDocument?.(contextMenu.itemId, spaceId);
                      handleCloseContextMenu();
                    }}
                    type="button"
                  >
                    <span>{folder.icon}</span> {folder.label}
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
