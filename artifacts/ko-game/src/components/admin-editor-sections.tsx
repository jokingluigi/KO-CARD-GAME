import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
type DirtyContext = { register: (id: string, dirty: boolean) => void };
export const AdminDirtyContext = createContext<DirtyContext>({
  register: () => {},
});
export function useAdminDraftGuard(
  active: boolean,
  value: unknown,
  resetToken?: string,
) {
  const { register } = useContext(AdminDirtyContext),
    id = useId(),
    baseline = useRef<string | null>(null);
  const reset = useRef(resetToken);
  const serialized = JSON.stringify(value);
  if (resetToken !== reset.current) {
    baseline.current = active ? serialized : null;
    reset.current = resetToken;
  }
  if (!active) baseline.current = null;
  else if (baseline.current === null) baseline.current = serialized;
  const dirty = active && baseline.current !== serialized;
  useEffect(() => {
    register(id, dirty);
    return () => register(id, false);
  }, [id, dirty, register]);
  return dirty;
}
export function confirmDiscardAdminDraft(dirty: boolean) {
  return (
    !dirty ||
    window.confirm(
      "저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?",
    )
  );
}
export function AdminEditorSections({
  panels,
  children,
}: {
  panels: { id: string; label: string }[];
  children: ReactNode[];
}) {
  const prefix = useId();
  const sectionRoot=useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(panels[0]?.id);
  useEffect(()=>{
    const node=sectionRoot.current;
    if(!node)return;
    const reveal=(event:Event)=>{
      const field=event.target as HTMLElement;
      const panel=field.closest<HTMLElement>('[data-admin-panel]');
      if(panel?.dataset.adminPanel)setActive(panel.dataset.adminPanel);
      for(let parent=field.parentElement;parent&&parent!==node;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
      requestAnimationFrame(()=>{field.focus({preventScroll:true});field.scrollIntoView({block:'center',behavior:'instant'});});
    };
    node.addEventListener('ko-admin-reveal-field',reveal);
    return()=>node.removeEventListener('ko-admin-reveal-field',reveal);
  },[]);
  return (
    <div ref={sectionRoot}
      className="admin-editor-sections md:col-span-2"
      onInvalidCapture={(e) => {
        const panel = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-admin-panel]",
        );
        if (panel?.dataset.adminPanel) setActive(panel.dataset.adminPanel);
      }}
    >
      <div
        className="admin-editor-tabs"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const index = panels.findIndex((p) => p.id === active);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? panels.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + panels.length) %
                  panels.length;
          setActive(panels[next].id);
          document.getElementById(prefix + "tab-" + panels[next].id)?.focus();
        }}
        role="tablist"
        aria-label="편집 설정"
      >
        {panels.map((p,index) => (
          <button
            type="button"
            role="tab"
            aria-selected={active === p.id}
            tabIndex={active === p.id ? 0 : -1}
            aria-controls={prefix + "panel-" + p.id}
            id={prefix + "tab-" + p.id}
            key={p.id}
            onClick={() => setActive(p.id)}
          >
            <span className="admin-editor-tab-number" aria-hidden="true">{index+1}</span>{p.label}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <section
          className="admin-editor-panel"
          role="tabpanel"
          hidden={active !== p.id}
          aria-labelledby={prefix + "tab-" + p.id}
          id={prefix + "panel-" + p.id}
          data-admin-panel={p.id}
          key={p.id}
        >
          <h4>{p.label}</h4>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">{children[i]}</div>
        </section>
      ))}
    </div>
  );
}

export function useAdminMutableDraft(value: unknown, identity?: string) {
  const [revision, setRevision] = useState(0);
  const dirty = useAdminDraftGuard(
    true,
    value,
    JSON.stringify([identity, revision]),
  );
  return {
    dirty,
    markSaved: () => setRevision((v) => v + 1),
    confirm: () => confirmDiscardAdminDraft(dirty),
  };
}
