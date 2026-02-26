import { useEffect, useState } from "react";
import { fetchApprovals } from "../api/client";
import type { ApprovalsResponse } from "../api/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { MergeGateBadge } from "../ui/MergeGateBadge";
import { StatusPill } from "../ui/StatusPill";

type ViewState = "success" | "loading" | "empty" | "error";

export function ApprovalsPage() {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [approvals, setApprovals] = useState<ApprovalsResponse | null>(null);

  useEffect(() => {
    let active = true;
    setViewState("loading");
    fetchApprovals()
      .then((response) => {
        if (!active) {
          return;
        }
        setApprovals(response);
        setViewState(response.queue.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        if (active) {
          setViewState("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function retry() {
    setViewState("loading");
    fetchApprovals()
      .then((response) => {
        setApprovals(response);
        setViewState(response.queue.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        setViewState("error");
      });
  }

  return (
    <section>
      <div className="section-head">
        <h1>Approvals</h1>
        <p className="muted">Approval-chain journey backed by merge-gate API states.</p>
      </div>

      {viewState === "loading" && (
        <div className="grid">
          {[1, 2].map((id) => (
            <Card key={id}>
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </Card>
          ))}
        </div>
      )}

      {viewState === "empty" && (
        <Card>
          <h2>No pending approvals</h2>
          <p className="muted">You have no documents waiting for sign-off right now.</p>
        </Card>
      )}

      {viewState === "error" && (
        <Card>
          <h2>Approval queue unavailable</h2>
          <p className="muted">Service timeout while loading approval chains.</p>
          <div>
            <Button onClick={retry}>Retry</Button>
          </div>
        </Card>
      )}

      {viewState === "success" && approvals && (
        <div className="grid approvals-grid">
          <Card>
            <h2>Merge Gate Preview</h2>
            <p className="muted">
              Merge stays blocked until required approvers sign off and open annotations are resolved.
            </p>
            <MergeGateBadge gate={approvals.mergeGate} />
          </Card>

          <Card>
            <h2>Pending Queue</h2>
            <div className="approvals-list">
              {approvals.queue.map((item) => (
                <div className="approvals-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">Requested by {item.requestedBy}</p>
                  </div>
                  <StatusPill variant={item.status === "Blocked" ? "deferred" : "accepted"}>
                    {item.status}
                  </StatusPill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
