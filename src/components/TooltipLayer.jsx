import { useEffect } from 'react';

const TOOLTIP_ID = 'omaxfx-custom-tooltip';

function splitTooltip(value) {
  const parts = String(value || '').split(/\\s*[·|—]\\s*/, 2);
  return { heading: parts[0] || '', detail: parts[1] || '' };
}

export default function TooltipLayer() {
  useEffect(() => {
    const tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'omax-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.innerHTML = '<div class="omax-tooltip__eyebrow">OMAXFX</div><div class="omax-tooltip__heading"></div><div class="omax-tooltip__detail"></div>';
    document.body.appendChild(tooltip);

    const heading = tooltip.querySelector('.omax-tooltip__heading');
    const detail = tooltip.querySelector('.omax-tooltip__detail');
    let activeElement = null;
    let showTimer = null;
    let hideTimer = null;

    const convert = (element) => {
      if (!(element instanceof Element) || !element.hasAttribute('title')) return;
      const value = element.getAttribute('title');
      if (!value?.trim()) return;
      element.setAttribute('data-omax-tooltip', value);
      element.removeAttribute('title');
      if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-description')) {
        element.setAttribute('aria-description', value);
      }
    };

    const convertTree = (node) => {
      if (!(node instanceof Element)) return;
      convert(node);
      node.querySelectorAll?.('[title]').forEach(convert);
    };

    document.querySelectorAll('[title]').forEach(convert);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'attributes') convert(record.target);
        else record.addedNodes.forEach(convertTree);
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

    const position = (element) => {
      const rect = element.getBoundingClientRect();
      const bounds = tooltip.getBoundingClientRect();
      const gap = 10;
      const canFitAbove = rect.top >= bounds.height + gap + 8;
      const top = canFitAbove ? rect.top - bounds.height - gap : rect.bottom + gap;
      const left = Math.min(
        window.innerWidth - bounds.width / 2 - 10,
        Math.max(bounds.width / 2 + 10, rect.left + rect.width / 2)
      );
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`;
    };

    const hide = (immediate = false) => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      const finish = () => {
        tooltip.classList.remove('is-visible');
        tooltip.setAttribute('aria-hidden', 'true');
        if (activeElement?.getAttribute('aria-describedby') === TOOLTIP_ID) {
          activeElement.removeAttribute('aria-describedby');
        }
        activeElement = null;
      };
      if (immediate) finish();
      else hideTimer = window.setTimeout(finish, 90);
    };

    const show = (element) => {
      const value = element?.getAttribute('data-omax-tooltip');
      if (!value) return;
      window.clearTimeout(hideTimer);
      if (activeElement !== element) {
        activeElement = element;
        const parts = splitTooltip(value);
        heading.textContent = parts.heading;
        detail.textContent = parts.detail;
        detail.hidden = !parts.detail;
      }
      tooltip.setAttribute('aria-hidden', 'false');
      tooltip.classList.add('is-visible');
      position(element);
      element.setAttribute('aria-describedby', TOOLTIP_ID);
    };

    const onPointerOver = (event) => {
      const element = event.target instanceof Element ? event.target.closest('[data-omax-tooltip]') : null;
      if (!element || element === activeElement) return;
      window.clearTimeout(hideTimer);
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => show(element), 360);
    };

    const onPointerOut = (event) => {
      if (!activeElement) return;
      if (activeElement.contains(event.relatedTarget)) return;
      const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-omax-tooltip]') : null;
      if (next) {
        window.clearTimeout(showTimer);
        show(next);
      } else hide();
    };

    const onFocusIn = (event) => {
      const element = event.target instanceof Element ? event.target.closest('[data-omax-tooltip]') : null;
      if (element) {
        window.clearTimeout(showTimer);
        show(element);
      }
    };
    const onFocusOut = (event) => {
      if (activeElement && !activeElement.contains(event.relatedTarget)) hide();
    };
    const onScroll = () => { if (activeElement) position(activeElement); };
    const onPointerDown = () => hide(true);

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    return () => {
      observer.disconnect();
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      tooltip.remove();
    };
  }, []);

  return null;
}
