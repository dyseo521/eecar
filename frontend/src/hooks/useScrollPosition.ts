import { useState, useEffect, startTransition } from 'react';

/**
 * 최적화된 스크롤 위치 훅 (requestAnimationFrame 사용)
 * startTransition으로 비긴급 업데이트 처리하여 60fps 유지
 */
export function useScrollPosition() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          startTransition(() => {
            setScrollY(window.scrollY);
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return scrollY;
}
