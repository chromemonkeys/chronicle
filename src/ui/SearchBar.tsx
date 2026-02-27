import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchGlobal } from "../api/client";
import type { SearchResponse, SearchResult, SearchResultType } from "../api/types";

type SearchFilter = "all" | SearchResultType;

type SearchBarProps = {
  spaceId?: string;
};

const FILTERS: Array<{ id: SearchFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "document", label: "Documents" },
  { id: "thread", label: "Threads" },
  { id: "decision", label: "Decisions" }
];

function typeIcon(type: SearchResultType) {
  if (type === "document") return "Doc";
  if (type === "thread") return "Thr";
  return "Log";
}

export function SearchBar({ spaceId }: SearchBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [payload, setPayload] = useState<SearchResponse>({ results: [], total: 0, query: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPayload({ results: [], total: 0, query: trimmed });
      setIsLoading(false);
      setError(null);
      setOpen(false);
      setActiveIndex(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      searchGlobal(trimmed, {
        type: filter === "all" ? undefined : filter,
        spaceId,
        limit: 12,
        offset: 0
      })
        .then((data) => {
          setPayload(data);
          setOpen(true);
          setActiveIndex(0);
        })
        .catch(() => {
          setError("Search failed. Please retry.");
          setPayload({ results: [], total: 0, query: trimmed });
          setOpen(true);
          setActiveIndex(0);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query, filter, spaceId]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const hasResults = payload.results.length > 0;

  const visibleResults = useMemo(() => payload.results.slice(0, 12), [payload.results]);

  function goToResult(result: SearchResult) {
    if (result.type === "thread") {
      navigate(`/workspace/${result.documentId}?threadId=${encodeURIComponent(result.id)}`);
      return;
    }
    if (result.type === "decision") {
      navigate(`/workspace/${result.documentId}?decisionId=${encodeURIComponent(result.id)}`);
      return;
    }
    navigate(`/workspace/${result.documentId}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleResults.length === 0) {
      if (event.key === "Escape") {
        setOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % visibleResults.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + visibleResults.length) % visibleResults.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = visibleResults[activeIndex];
      if (selected) {
        goToResult(selected);
        setOpen(false);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search-wrap" ref={containerRef}>
      <div className="search-bar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search documents, threads, and decisions..."
          aria-label="Global search"
        />
      </div>
      <div className="search-filter-pills">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            className={`search-filter-pill${filter === option.id ? " active" : ""}`}
            onClick={() => setFilter(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {open && (
        <div className="search-results">
          {isLoading ? <div className="search-results-state">Searching...</div> : null}
          {!isLoading && error ? <div className="search-results-state">{error}</div> : null}
          {!isLoading && !error && !hasResults ? (
            <div className="search-results-state">No results for "{payload.query}".</div>
          ) : null}
          {!isLoading &&
            !error &&
            visibleResults.map((result, index) => (
              <button
                key={`${result.type}-${result.id}-${index}`}
                className={`search-result-item${index === activeIndex ? " active" : ""}`}
                onClick={() => {
                  goToResult(result);
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                type="button"
              >
                <span className="search-result-type">{typeIcon(result.type)}</span>
                <span className="search-result-body">
                  <span className="search-result-title">{result.title || "Untitled"}</span>
                  <span
                    className="search-result-snippet"
                    dangerouslySetInnerHTML={{
                      __html: result.snippet || ""
                    }}
                  />
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
