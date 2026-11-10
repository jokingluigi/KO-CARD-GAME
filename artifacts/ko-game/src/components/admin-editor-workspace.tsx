import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Eye,
  FilePenLine,
  CheckCircle2,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import "./admin-workspace.css";

/** One accessible editor surface. Existing forms, saves and image controls remain the source of truth. */
export function AdminEditorWorkspace({
  title,
  description,
  dirty,
  busy = false,
  uploading = false,
  isNew = false,
  error,
  onClose,
  onSave,
  children,
}: {
  title: string;
  description: string;
  dirty: boolean;
  busy?: boolean;
  uploading?: boolean;
  isNew?: boolean;
  error?: string;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  const [view, setView] = useState<"edit" | "preview">("edit");
  const root = useRef<HTMLDivElement>(null),
    returnFocus = useRef(document.activeElement as HTMLElement | null);
  const locked = busy || uploading;
  const status = uploading
    ? "파일 업로드 중"
    : busy
      ? "저장 처리 중"
      : error
        ? "입력·저장 확인 필요"
        : dirty
          ? "저장하지 않은 변경사항"
          : isNew
            ? "새 항목 · 아직 저장 전"
            : "저장된 내용";
  useEffect(() => {
    if (error) setView("edit");
  }, [error]);
  function findError() {
    setView("edit");
    requestAnimationFrame(() => {
      const field = root.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      if (field)
        field.dispatchEvent(
          new CustomEvent("ko-admin-reveal-field", { bubbles: true }),
        );
      else
        root.current
          ?.querySelector<HTMLElement>(".admin-workbench-error")
          ?.focus({ preventScroll: true });
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        ref={root}
        data-admin-workbench
        data-view={view}
        className="admin-editor-dialog admin-workbench"
        onPointerDownOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLInputElement>(
                '[data-admin-panel]:not([hidden]) input:not([type="checkbox"]),input:not([type="checkbox"])',
              )
              ?.focus({ preventScroll: true }),
          );
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => {
            if (returnFocus.current?.isConnected)
              returnFocus.current.focus({ preventScroll: true });
          });
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            if (!locked) onSave();
          }
        }}
      >
        <header className="admin-workbench-header">
          <button
            type="button"
            className="admin-workbench-back"
            onClick={onClose}
            disabled={locked}
            aria-label="편집을 닫고 목록으로"
          >
            <ArrowLeft size={18} />
            <span>목록으로</span>
          </button>
          <div className="admin-workbench-heading">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <div
            className="admin-workbench-status"
            data-status={
              error
                ? "error"
                : locked
                  ? "busy"
                  : dirty || isNew
                    ? "dirty"
                    : "saved"
            }
            role="status"
          >
            {locked ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : error ? (
              <AlertCircle size={16} />
            ) : dirty || isNew ? (
              <FilePenLine size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            <span>{status}</span>
          </div>
        </header>
        <nav className="admin-workbench-view" aria-label="편집 화면 보기">
          <button
            type="button"
            aria-pressed={view === "edit"}
            onClick={() => setView("edit")}
          >
            <FilePenLine size={16} />
            설정 편집
          </button>
          <button
            type="button"
            aria-pressed={view === "preview"}
            onClick={() => setView("preview")}
          >
            <Eye size={16} />
            미리보기
          </button>
          <span>입력 내용은 저장 버튼을 눌러 반영합니다.</span>
        </nav>
        {error && (
          <div className="admin-workbench-error" role="alert" tabIndex={-1}>
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" onClick={findError}>
              오류 위치 확인
            </button>
          </div>
        )}
        <div className="admin-workbench-body">{children}</div>
        <span className="admin-workbench-shortcut" aria-hidden="true">
          Ctrl / ⌘ + S · 저장
        </span>
      </DialogContent>
    </Dialog>
  );
}
