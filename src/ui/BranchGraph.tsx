/**
 * Branch Graph Visualization — Chronicle
 *
 * A production-grade Git-style branch timeline showing:
 * - Main branch rail with commit nodes
 * - Proposal branches with fork/merge topology
 * - Merge connectors with smooth bezier curves
 * - Interactive commit detail on hover/click
 * - Expanded fullscreen modal with full detail view
 *
 * Aesthetic: Technical blueprint meets editorial design.
 * Uses Chronicle's paper/ink/accent palette with Literata + DM Sans.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { WorkspaceHistoryItem } from "../api/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BranchGraphCommit {
  hash: string;
  message: string;
  author: string;
  timeAgo: string;
  branch: string;
  branchColor: string;
  parentHashes: string[];
  column: number;
  row: number;
  isMerge: boolean;
  isFork: boolean;
  mergeSource?: string;
  mergeColor?: string;
  forkedFrom?: string;
  createdAt: string;
}

export interface BranchGraphBranch {
  name: string;
  displayName: string;
  color: string;
  column: number;
  head: string;
  base?: string;
  status: "active" | "merged" | "closed";
  commitCount: number;
  startRow: number;
  endRow: number;
}

export interface BranchGraphData {
  commits: BranchGraphCommit[];
  branches: BranchGraphBranch[];
}

interface BranchGraphProps {
  data?: BranchGraphData;
  historyData?: { commits: WorkspaceHistoryItem[] } | null;
  mainHistoryData?: { commits: WorkspaceHistoryItem[] } | null;
  proposalId?: string | null;
  branchName?: string;
  width?: number;
  height?: number;
  rowHeight?: number;
  className?: string;
  onExpand?: () => void;
  isExpanded?: boolean;
  onClose?: () => void;
  onSelectCommit?: (commitHash: string) => void;
  loading?: boolean;
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BRANCH_COLORS = [
  "#2d7a4f", // emerald
  "#2d5e9e", // blue
  "#7c3aed", // violet
  "#b38a2d", // amber
  "#be185d", // rose
  "#0891b2", // cyan
  "#65a30d", // lime
  "#d97706", // orange
];

const MAIN_COLOR = "var(--accent)";
const COL_WIDTH = 22;
const COL_WIDTH_EXPANDED = 32;
const LEFT_PAD = 16;
const LEFT_PAD_EXPANDED = 24;
const TOP_PAD = 12;
const NODE_R = 4;
const NODE_R_MERGE = 5;
const LINE_W = 2;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

/** Extract author name from meta field like "asd · 42m ago · +0 -0 lines" */
function extractAuthorFromMeta(meta: string): string {
  const parts = meta.split(" · ");
  return parts[0]?.trim() || "User";
}

/** Extract relative time from meta field like "asd · 42m ago · +0 -0 lines" */
function extractTimeFromMeta(meta: string): string {
  const parts = meta.split(" · ");
  return parts[1]?.trim() || "";
}

/** Clean commit message — strip merge metadata, show short prop ID */
function cleanMessage(msg: string): string {
  // Take first line only (before \n\n)
  const firstLine = msg.split("\n")[0];
  // Strip metadata suffixes
  let clean = firstLine
    .replace(/\s*\|.*$/, "")
    .replace(/\s*actor=.*$/, "")
    .replace(/\s*merge:\s*source=.*$/, "")
    .replace(/\s*source=.*$/, "")
    .trim();
  // Shorten prop IDs: "Merge proposal prop_d456994a8985..." → "Merge #d45699"
  clean = clean.replace(/proposal\s+prop_([a-f0-9]{6})[a-f0-9]*/i, "#$1");
  return clean;
}

/** Extract the prop_<hex> ID directly from message */
function extractPropId(msg: string): string | null {
  const match = msg.match(/prop_([a-f0-9]{8,})/i);
  return match ? match[0] : null;
}

/** Check if a commit is a merge based on available signals */
function isMergeCommit(item: WorkspaceHistoryItem): boolean {
  if (item.eventType === "merge") return true;
  if (item.mergeSource) return true;
  // Check first line of message for merge indicator
  const firstLine = item.message.split("\n")[0].toLowerCase();
  return firstLine.startsWith("merge ");
}

/* ------------------------------------------------------------------ */
/*  Graph builder                                                      */
/* ------------------------------------------------------------------ */

export function buildBranchGraph(
  history: WorkspaceHistoryItem[],
  proposalId: string | null,
  branchName: string
): BranchGraphData {
  if (!history.length) return { commits: [], branches: [] };

  // Deduplicate by hash, keep order from API (newest first)
  const seen = new Set<string>();
  const items = history.filter((item) => {
    if (seen.has(item.hash)) return false;
    seen.add(item.hash);
    return true;
  });

  // ── Phase 1: Classify commits ──────────────────────────────────────
  // Each merge commit implies a proposal that forked, had work, and merged.
  // We synthesize branch topology: for each merge we insert a "proposal work"
  // commit on column 1, creating a fork→work→merge pattern.

  type MergeInfo = {
    propId: string;
    shortId: string;
    color: string;
    author: string;
    timeAgo: string;
  };
  const mergeInfoByHash = new Map<string, MergeInfo>();
  let colorIdx = 0;

  items.forEach((item) => {
    if (isMergeCommit(item)) {
      const propId = extractPropId(item.message);
      if (propId) {
        mergeInfoByHash.set(item.hash, {
          propId,
          shortId: propId.slice(5, 11),
          color: BRANCH_COLORS[colorIdx % BRANCH_COLORS.length],
          author: extractAuthorFromMeta(item.meta),
          timeAgo: extractTimeFromMeta(item.meta),
        });
        colorIdx++;
      }
    }
  });

  // ── Phase 2: Build interleaved row list ─────────────────────────────
  // For each merge commit on main, we insert an extra row AFTER it for the
  // synthetic proposal work commit on column 1. This produces:
  //   Row N:   merge node on main (column 0)  ← merge point
  //   Row N+1: proposal work node (column 1)  ← synthetic commit
  // Non-merge commits stay on main (column 0) with no extra row.

  const commits: BranchGraphCommit[] = [];
  const branches: BranchGraphBranch[] = [];
  let row = 0;

  // Track branches for the legend
  const branchNames = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const merge = mergeInfoByHash.get(item.hash);
    const author = extractAuthorFromMeta(item.meta);
    const timeAgo = extractTimeFromMeta(item.meta);

    if (merge) {
      // ── Merge commit on main rail ──
      commits.push({
        hash: item.hash,
        message: cleanMessage(item.message),
        author,
        timeAgo,
        createdAt: item.createdAt || "",
        branch: "main",
        branchColor: MAIN_COLOR,
        parentHashes: [],
        column: 0,
        row,
        isMerge: true,
        isFork: false,
        mergeSource: merge.propId,
        mergeColor: merge.color,
        forkedFrom: undefined,
      });
      row++;

      // ── Synthetic proposal work commit on branch lane ──
      const proposalName = `#${merge.shortId}`;
      commits.push({
        hash: `synth-${merge.propId}`,
        message: `Proposal ${proposalName} work`,
        author: merge.author,
        timeAgo: merge.timeAgo,
        createdAt: "",
        branch: merge.propId,
        branchColor: merge.color,
        parentHashes: [],
        column: 1,
        row,
        isMerge: false,
        isFork: false,
        mergeSource: undefined,
        mergeColor: merge.color,
        forkedFrom: undefined,
      });
      branchNames.add(proposalName);
      row++;
    } else {
      // ── Regular commit on main rail ──
      commits.push({
        hash: item.hash,
        message: cleanMessage(item.message),
        author,
        timeAgo,
        createdAt: item.createdAt || "",
        branch: "main",
        branchColor: MAIN_COLOR,
        parentHashes: [],
        column: 0,
        row,
        isMerge: false,
        isFork: false,
        mergeSource: undefined,
        mergeColor: undefined,
        forkedFrom: undefined,
      });
      row++;
    }
  }

  // ── Phase 3: If there's an active (unmerged) proposal, show it ──────
  if (proposalId && branchName !== "main") {
    const activeColor = BRANCH_COLORS[colorIdx % BRANCH_COLORS.length];
    const shortName = branchName
      .replace("proposals/", "")
      .replace("proposal-", "")
      .slice(0, 12);

    // Find proposal-specific commits (ones with branch matching proposal)
    // These come from historyData when viewing a proposal
    const proposalCommits = items.filter(
      (item) => item.branch && item.branch !== "main" && !mergeInfoByHash.has(item.hash)
    );

    if (proposalCommits.length > 0) {
      // Insert active proposal commits at the top (newest)
      // Shift all existing rows down
      const shift = proposalCommits.length;
      commits.forEach((c) => (c.row += shift));

      proposalCommits.forEach((item, idx) => {
        commits.unshift({
          hash: item.hash,
          message: cleanMessage(item.message),
          author: extractAuthorFromMeta(item.meta),
          timeAgo: extractTimeFromMeta(item.meta),
          createdAt: item.createdAt || "",
          branch: branchName,
          branchColor: activeColor,
          parentHashes: [],
          column: 1,
          row: idx,
          isMerge: false,
          isFork: false,
          mergeSource: undefined,
          mergeColor: activeColor,
          forkedFrom: undefined,
        });
      });

      branches.push({
        name: branchName,
        displayName: shortName || "proposal",
        color: activeColor,
        column: 1,
        head: proposalCommits[0]?.hash || "",
        status: "active",
        commitCount: proposalCommits.length,
        startRow: 0,
        endRow: proposalCommits.length - 1,
      });
    }
  }

  // ── Build main branch entry ──────────────────────────────────────────
  const mainCommits = commits.filter((c) => c.column === 0);
  branches.unshift({
    name: "main",
    displayName: "main",
    color: MAIN_COLOR,
    column: 0,
    head: mainCommits[0]?.hash || "",
    status: "active",
    commitCount: mainCommits.length,
    startRow: mainCommits.length > 0 ? mainCommits[mainCommits.length - 1].row : 0,
    endRow: mainCommits.length > 0 ? mainCommits[0].row : 0,
  });

  return { commits, branches };
}

/* ------------------------------------------------------------------ */
/*  SVG path helpers                                                   */
/* ------------------------------------------------------------------ */

function railX(col: number, expanded: boolean): number {
  const pad = expanded ? LEFT_PAD_EXPANDED : LEFT_PAD;
  const w = expanded ? COL_WIDTH_EXPANDED : COL_WIDTH;
  return pad + col * w;
}

function commitY(row: number, rowH: number): number {
  return TOP_PAD + row * rowH + rowH / 2;
}

/**
 * Draw a fork connector: smooth bezier from main rail down to branch node.
 * Goes from main (col 0) at forkRow+offset down/right to branch node at branchRow.
 */
function forkPath(
  mainCol: number,
  branchCol: number,
  forkRow: number,   // the row BELOW the branch node (where it forks from main)
  branchRow: number, // the branch commit row
  rowH: number,
  expanded: boolean,
): string {
  const mainX = railX(mainCol, expanded);
  const branchX = railX(branchCol, expanded);
  // Fork starts from between the merge row and the branch row on main
  const startY = commitY(forkRow, rowH) - rowH * 0.3;
  const endY = commitY(branchRow, rowH);
  const dx = branchX - mainX;
  return [
    `M ${mainX} ${startY}`,
    `C ${mainX + dx * 0.4} ${startY},`,
    `  ${branchX} ${startY + (endY - startY) * 0.4},`,
    `  ${branchX} ${endY}`,
  ].join(" ");
}

/**
 * Draw a merge connector: smooth bezier from branch node up to merge point on main.
 */
function mergePath(
  mainCol: number,
  branchCol: number,
  branchRow: number, // where the branch commit is
  mergeRow: number,  // where it merges into main
  rowH: number,
  expanded: boolean,
): string {
  const mainX = railX(mainCol, expanded);
  const branchX = railX(branchCol, expanded);
  const startY = commitY(branchRow, rowH);
  const endY = commitY(mergeRow, rowH);
  const dx = branchX - mainX;
  return [
    `M ${branchX} ${startY}`,
    `C ${branchX} ${startY - (startY - endY) * 0.6},`,
    `  ${mainX + dx * 0.4} ${endY},`,
    `  ${mainX} ${endY}`,
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

function CommitTooltip({
  commit,
  x,
  y,
  side,
}: {
  commit: BranchGraphCommit;
  x: number;
  y: number;
  side: "left" | "right";
}) {
  return (
    <div
      className="bg-tooltip"
      style={{
        position: "absolute",
        top: y - 10,
        ...(side === "right" ? { left: x + 20 } : { right: x + 20 }),
      }}
    >
      <div className="bg-tooltip-hash">{shortHash(commit.hash)}</div>
      <div className="bg-tooltip-msg">{commit.message}</div>
      <div className="bg-tooltip-meta">
        <span>{commit.author}</span>
        <span>{commit.timeAgo}</span>
      </div>
      {commit.isMerge && commit.mergeSource && (
        <div className="bg-tooltip-badge bg-tooltip-badge--merge">
          Merged {commit.mergeSource}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Branch rail legend                                                 */
/* ------------------------------------------------------------------ */

function BranchLegend({
  branches,
  commits,
}: {
  branches: BranchGraphBranch[];
  commits: BranchGraphCommit[];
}) {
  const mergeCount = commits.filter((c) => c.isMerge).length;
  const branchCommitCount = commits.filter((c) => c.column > 0 && !c.hash.startsWith("synth-")).length;
  const mainDirectCount = commits.filter((c) => c.column === 0 && !c.isMerge).length;
  const proposalCount = commits.filter((c) => c.hash.startsWith("synth-")).length + branchCommitCount;

  return (
    <div className="bg-legend">
      <div className="bg-legend-branches">
        {branches.map((b) => (
          <div key={b.name} className="bg-legend-item">
            <span className="bg-legend-rail" style={{ background: b.color }} />
            <span className="bg-legend-name">{b.displayName}</span>
            {b.status === "active" && b.name !== "main" && (
              <span className="bg-legend-status bg-legend-status--active">active</span>
            )}
          </div>
        ))}
        {mergeCount > 0 && (
          <div className="bg-legend-item">
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
              <rect x="2" y="2" width="6" height="6" rx="1"
                transform="rotate(45 5 5)"
                fill="var(--ink-3)" />
            </svg>
            <span className="bg-legend-name">merge</span>
          </div>
        )}
        <div className="bg-legend-item">
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
            <circle cx="5" cy="5" r="3" fill="var(--ink-3)" />
          </svg>
          <span className="bg-legend-name">commit</span>
        </div>
      </div>
      <div className="bg-legend-stats">
        {mergeCount > 0 && (
          <span>{mergeCount} merged proposals</span>
        )}
        {proposalCount > 0 && (
          <>
            {mergeCount > 0 && <span className="bg-legend-dot" />}
            <span>{proposalCount} proposal commits</span>
          </>
        )}
        {mainDirectCount > 0 && (
          <>
            <span className="bg-legend-dot" />
            <span>{mainDirectCount} direct</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function BranchGraph({
  data: dataProp,
  historyData,
  mainHistoryData,
  proposalId,
  branchName = "main",
  rowHeight: rowHeightProp,
  className = "",
  onExpand,
  isExpanded = false,
  onClose,
  onSelectCommit,
  loading,
  error,
}: BranchGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;
    y: number;
    side: "left" | "right";
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const rowHeight = rowHeightProp || (isExpanded ? 48 : 40);

  // Build graph data
  const data = useMemo(() => {
    if (dataProp) return dataProp;
    const history: WorkspaceHistoryItem[] = [];
    if (mainHistoryData?.commits) history.push(...mainHistoryData.commits);
    if (historyData?.commits) history.push(...historyData.commits);
    return buildBranchGraph(history, proposalId || null, branchName);
  }, [dataProp, historyData, mainHistoryData, proposalId, branchName]);

  const expanded = isExpanded;
  // Graph area: main rail + one branch lane + padding
  const graphLeftWidth = railX(1, expanded) + (expanded ? COL_WIDTH_EXPANDED : COL_WIDTH);
  const totalRows = data.commits.length > 0
    ? data.commits[data.commits.length - 1].row + 1
    : 0;
  const contentHeight = TOP_PAD + totalRows * rowHeight + 16;

  // Hover handler
  const handleCommitHover = useCallback(
    (hash: string | null, e?: React.MouseEvent) => {
      setHoveredCommit(hash);
      if (hash && e && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setTooltipPos({
          x,
          y,
          side: x > rect.width / 2 ? "left" : "right",
        });
      } else {
        setTooltipPos(null);
      }
    },
    []
  );

  const hoveredCommitData = useMemo(
    () => data.commits.find((c) => c.hash === hoveredCommit) || null,
    [data.commits, hoveredCommit]
  );

  /* ---------------------------------------------------------------- */
  /*  Build SVG elements                                               */
  /* ---------------------------------------------------------------- */

  const { rails, connectors, nodes } = useMemo(() => {
    const _rails: JSX.Element[] = [];
    const _connectors: JSX.Element[] = [];
    const _nodes: JSX.Element[] = [];

    if (!data.commits.length)
      return { rails: _rails, connectors: _connectors, nodes: _nodes };

    const nr = expanded ? NODE_R + 1 : NODE_R;
    const nrm = expanded ? NODE_R_MERGE + 1 : NODE_R_MERGE;
    const totalRows = data.commits.length > 0
      ? data.commits[data.commits.length - 1].row + 1
      : 0;

    // --- Main rail (continuous vertical line through all main-column commits) ---
    const mainCommits = data.commits.filter((c) => c.column === 0);
    const mainX = railX(0, expanded);
    if (mainCommits.length > 0) {
      _rails.push(
        <line
          key="rail-main"
          x1={mainX}
          y1={commitY(mainCommits[0].row, rowHeight) - 4}
          x2={mainX}
          y2={commitY(mainCommits[mainCommits.length - 1].row, rowHeight) + 4}
          className="bg-rail bg-rail--main"
          stroke={MAIN_COLOR}
          strokeWidth={LINE_W}
        />
      );
    }

    // --- Branch connectors (fork + merge paths for each proposal) ---
    // For each merge commit, find its paired synthetic branch commit (next row, col 1)
    data.commits.forEach((commit, idx) => {
      if (commit.isMerge && commit.mergeColor) {
        // The synthetic branch commit is the next commit in the array at column 1
        const branchCommit = data.commits[idx + 1];
        if (branchCommit && branchCommit.column === 1) {
          const color = commit.mergeColor;

          // Fork: main rail at branchRow → branch node
          // We fork from the main rail at a point below the branch node
          _connectors.push(
            <path
              key={`fork-${commit.hash}`}
              d={forkPath(0, 1, branchCommit.row, branchCommit.row, rowHeight, expanded)}
              className="bg-connector bg-connector--fork"
              stroke={color}
              strokeWidth={LINE_W}
              fill="none"
            />
          );

          // Merge: branch node → merge point on main
          _connectors.push(
            <path
              key={`merge-${commit.hash}`}
              d={mergePath(0, 1, branchCommit.row, commit.row, rowHeight, expanded)}
              className="bg-connector bg-connector--merge"
              stroke={color}
              strokeWidth={LINE_W}
              fill="none"
            />
          );
        }
      }
    });

    // --- Active proposal branch connectors (unmerged) ---
    const activeBranchCommits = data.commits.filter(
      (c) => c.column === 1 && !c.hash.startsWith("synth-")
    );
    if (activeBranchCommits.length > 0) {
      const branchX = railX(1, expanded);
      const firstActive = activeBranchCommits[0];
      const lastActive = activeBranchCommits[activeBranchCommits.length - 1];
      const activeColor = firstActive.branchColor;

      // Branch rail for active proposal
      _rails.push(
        <line
          key="rail-active"
          x1={branchX}
          y1={commitY(firstActive.row, rowHeight) - 4}
          x2={branchX}
          y2={commitY(lastActive.row, rowHeight) + 4}
          className="bg-rail bg-rail--branch"
          stroke={activeColor}
          strokeWidth={LINE_W}
        />
      );

      // Fork connector from main to the active branch
      const forkFromRow = lastActive.row + 1;
      if (forkFromRow < totalRows) {
        _connectors.push(
          <path
            key="fork-active"
            d={forkPath(0, 1, forkFromRow, lastActive.row, rowHeight, expanded)}
            className="bg-connector bg-connector--fork"
            stroke={activeColor}
            strokeWidth={LINE_W}
            fill="none"
          />
        );
      }
    }

    // --- Commit nodes ---
    data.commits.forEach((commit) => {
      const x = railX(commit.column, expanded);
      const cy = commitY(commit.row, rowHeight);
      const isHovered = commit.hash === hoveredCommit;
      const nodeColor = commit.mergeColor || commit.branchColor;

      if (commit.isMerge) {
        // Diamond node for merge commits
        const s = isHovered ? nrm + 1 : nrm;
        _nodes.push(
          <g key={`node-${commit.hash}`} className="bg-node bg-node--merge">
            {isHovered && (
              <circle cx={x} cy={cy} r={s + 5} className="bg-node-glow"
                fill={nodeColor} />
            )}
            <rect
              x={x - s} y={cy - s}
              width={s * 2} height={s * 2}
              rx={1.5}
              transform={`rotate(45 ${x} ${cy})`}
              fill={nodeColor}
              stroke="var(--paper)" strokeWidth={2}
            />
          </g>
        );
      } else {
        // Circle node for regular commits (main or branch)
        const r = isHovered ? nr + 1 : nr;
        _nodes.push(
          <g key={`node-${commit.hash}`} className="bg-node bg-node--commit">
            {isHovered && (
              <circle cx={x} cy={cy} r={r + 5} className="bg-node-glow"
                fill={nodeColor} />
            )}
            <circle
              cx={x} cy={cy} r={r}
              fill={nodeColor}
              stroke="var(--paper)" strokeWidth={2}
            />
          </g>
        );
      }
    });

    return { rails: _rails, connectors: _connectors, nodes: _nodes };
  }, [data, rowHeight, expanded, hoveredCommit]);

  /* ---------------------------------------------------------------- */
  /*  Loading / Error / Empty states                                   */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="bg-state bg-state--loading">
        <div className="bg-state-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <span>Loading branch history&hellip;</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-state bg-state--error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>Failed to load branch history</span>
      </div>
    );
  }

  if (!data.commits.length) {
    return (
      <div className="bg-state bg-state--empty">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" opacity="0.4">
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="3" x2="12" y2="9" />
          <line x1="12" y1="15" x2="12" y2="21" />
        </svg>
        <span>No commit history yet</span>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Graph content (shared between inline & expanded)                 */
  /* ---------------------------------------------------------------- */

  const graphContent = (
    <div
      className={`bg-graph-scroll ${mounted ? "bg-graph-scroll--visible" : ""}`}
      ref={containerRef}
      style={{ position: "relative" }}
    >
      {/* Commit rows — HTML overlay for crisp text */}
      <div className="bg-rows" style={{ paddingTop: TOP_PAD }}>
        {data.commits.map((commit) => {
          const isHovered = commit.hash === hoveredCommit;
          const isBranchCommit = commit.column > 0;
          const isSynthetic = commit.hash.startsWith("synth-");
          const nodeColor = commit.mergeColor || commit.branchColor;

          return (
            <div
              key={commit.hash}
              className={[
                "bg-row",
                isHovered ? "bg-row--hover" : "",
                commit.isMerge ? "bg-row--merge" : "",
                isBranchCommit ? "bg-row--branch" : "",
              ].filter(Boolean).join(" ")}
              style={{
                height: rowHeight,
                paddingLeft: graphLeftWidth,
              }}
              onMouseEnter={(e) => handleCommitHover(commit.hash, e)}
              onMouseLeave={() => handleCommitHover(null)}
              onClick={() => !isSynthetic && onSelectCommit?.(commit.hash)}
              data-commit-hash={commit.hash}
            >
              <span className="bg-row-hash" style={isBranchCommit ? { color: nodeColor } : undefined}>
                {isSynthetic ? "" : shortHash(commit.hash)}
              </span>
              <span className="bg-row-msg">
                {commit.isMerge && (
                  <span
                    className="bg-row-merge-icon"
                    style={{ color: nodeColor }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5">
                      <circle cx="18" cy="18" r="3" />
                      <circle cx="6" cy="6" r="3" />
                      <path d="M6 21V9a9 9 0 0 0 9 9h6" />
                    </svg>
                  </span>
                )}
                {isBranchCommit && !commit.isMerge && (
                  <span
                    className="bg-row-branch-icon"
                    style={{ color: nodeColor }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                  </span>
                )}
                <span style={isBranchCommit ? { color: nodeColor, fontStyle: "italic" } : undefined}>
                  {truncate(commit.message, expanded ? 80 : 28)}
                </span>
              </span>
              <span className="bg-row-author">
                <span
                  className="bg-row-avatar"
                  style={{ background: nodeColor }}
                >
                  {commit.author.slice(0, 2).toUpperCase()}
                </span>
              </span>
              <span className="bg-row-time">{commit.timeAgo}</span>
            </div>
          );
        })}
      </div>

      {/* SVG graph layer — positioned behind text */}
      <svg
        className="bg-svg"
        width={graphLeftWidth}
        height={contentHeight}
        viewBox={`0 0 ${graphLeftWidth} ${contentHeight}`}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      >
        {rails}
        {connectors}
        {nodes}
      </svg>

      {/* Tooltip — skip for synthetic commits */}
      {hoveredCommitData && tooltipPos && !hoveredCommitData.hash.startsWith("synth-") && (
        <CommitTooltip
          commit={hoveredCommitData}
          x={tooltipPos.x}
          y={tooltipPos.y}
          side={tooltipPos.side}
        />
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Expanded (modal) view                                            */
  /* ---------------------------------------------------------------- */

  if (expanded) {
    return (
      <div
        className="bg-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <div className="bg-modal">
          <div className="bg-modal-header">
            <div className="bg-modal-title-group">
              <h3 className="bg-modal-title">Branch Timeline</h3>
              <BranchLegend branches={data.branches} commits={data.commits} />
            </div>
            <button className="bg-close-btn" onClick={onClose} title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="bg-modal-body">{graphContent}</div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Inline (sidebar panel) view                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className={`bg-container ${className}`}>
      <div className="bg-header">
        <div className="bg-header-left">
          <svg className="bg-header-icon" width="14" height="14"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M6 21V9a9 9 0 0 0 9 9h6" />
          </svg>
          <span className="bg-header-title">Branch Timeline</span>
        </div>
        <div className="bg-header-right">
          <span className="bg-header-count">
            {data.commits.filter(c => !c.hash.startsWith("synth-")).length}
            <span className="bg-header-count-label"> commits</span>
          </span>
          {onExpand && (
            <button className="bg-expand-btn" onClick={onExpand} title="Expand view">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {graphContent}

      <BranchLegend branches={data.branches} commits={data.commits} />
    </div>
  );
}

export default BranchGraph;
