import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { SHORTCUT_GROUPS } from '@/lib/shortcuts';
import { useExplorer } from '@/state/explorer';

/** `?` overlay listing every keyboard shortcut (one source: lib/shortcuts). */
export function ShortcutsDialog() {
  const open = useExplorer((s) => s.helpOpen);
  const setOpen = useExplorer((s) => s.setHelpOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts work when no text field is focused.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                    <dt className="text-foreground/90">{item.label}</dt>
                    <dd>
                      <KbdGroup>
                        {item.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </KbdGroup>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
