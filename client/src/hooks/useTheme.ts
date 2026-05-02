import { useEffect } from 'react';

function isDaytime(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

export function useTheme() {
  useEffect(() => {
    function applyTheme() {
      if (isDaytime()) {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    }

    applyTheme();

    // Re-check every minute so the switch happens right at 6am/6pm
    const interval = setInterval(applyTheme, 60_000);
    return () => clearInterval(interval);
  }, []);
}
