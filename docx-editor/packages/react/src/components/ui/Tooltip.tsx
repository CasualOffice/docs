import * as React from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayMs?: number;
}

export function Tooltip({ content, children, side = 'bottom', delayMs = 400 }: TooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const triggerRef = React.useRef<HTMLElement>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable per-instance id linking the trigger's aria-describedby to
  // the tooltip's id, so assistive tech can resolve the tooltip text
  // from the trigger node. React 18+ ships useId; we fall back to a
  // ref-cached random string for older test setups that mock React.
  const reactUseId = (React as unknown as { useId?: () => string }).useId;
  const generatedId = reactUseId ? reactUseId() : null;
  const idRef = React.useRef<string>(
    generatedId ?? `tooltip-${Math.random().toString(36).slice(2)}`
  );
  const tooltipId = generatedId ?? idRef.current;

  const show = React.useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = side === 'top' ? rect.top - 8 : rect.bottom + 8;
        setPosition({ x, y });
      }
      setIsOpen(true);
    }, delayMs);
  }, [delayMs, side]);

  const hide = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(false);
  }, []);

  // Focus shows the tooltip with no delay — the keyboard user has
  // already committed by tabbing here, so making them wait 400 ms
  // for a description is hostile. WAI-ARIA Authoring Practices
  // recommends instant-on for focus + delay only for hover.
  const showOnFocus = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = side === 'top' ? rect.top - 8 : rect.bottom + 8;
      setPosition({ x, y });
    }
    setIsOpen(true);
  }, [side]);

  // Dismiss on Escape — WAI-ARIA tooltip pattern. Keeps the
  // keyboard user in control when a tooltip obscures something
  // they were trying to read.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, hide]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Type the child props for React 19 compatibility. Plus the
  // wiring for aria-describedby so screen readers announce the
  // tooltip content when the trigger is focused or hovered.
  type ChildProps = {
    ref?: React.Ref<HTMLElement>;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    'aria-describedby'?: string;
  };
  const childProps = children.props as ChildProps;

  const mergedDescribedBy = [childProps['aria-describedby'], tooltipId].filter(Boolean).join(' ');

  const child = React.cloneElement(children as React.ReactElement<ChildProps>, {
    ref: triggerRef,
    'aria-describedby': mergedDescribedBy,
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      childProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      childProps.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      showOnFocus();
      childProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      childProps.onBlur?.(e);
    },
  });

  return (
    <>
      {child}
      {isOpen && (
        <div
          id={tooltipId}
          role="tooltip"
          // Dark tooltip in BOTH light and dark mode, matching Google
          // Docs. The previous "invert on theme" rule made tooltips
          // black-on-white in light mode and white-on-black in dark
          // mode, which read as two completely different elements
          // and contributed to the "colors are inconsistent" feel.
          className="fixed z-50 px-2 py-1 text-xs font-medium text-white bg-slate-700 dark:bg-slate-800 rounded-md shadow-lg"
          style={{
            left: position.x,
            top: position.y,
            transform:
              side === 'top'
                ? 'translate(-50%, -100%)'
                : side === 'bottom'
                  ? 'translate(-50%, 0)'
                  : undefined,
            // Prevent the tooltip from intercepting the very mouse
            // event the trigger needs to keep its hover state.
            pointerEvents: 'none',
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
