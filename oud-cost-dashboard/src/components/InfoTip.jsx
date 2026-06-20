import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const POPUP_WIDTH = 300;

export default function InfoTip({ children }) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 16);
    setPopupStyle({
      top: rect.bottom + 8,
      left: Math.max(8, left),
    });

    function handleOutside(e) {
      if (!triggerRef.current?.contains(e.target) && !popupRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <span className="infotip">
      <button
        ref={triggerRef}
        className="infotip__trigger"
        aria-label="More information"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        i
      </button>
      {open && createPortal(
        <div ref={popupRef} className="infotip__popup" style={popupStyle}>
          <button className="infotip__close" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
          {children}
        </div>,
        document.body
      )}
    </span>
  );
}
