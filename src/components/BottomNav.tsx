import type { ComponentType } from 'react';
import { useAppStore, type Screen, type ScreenParams } from '../store/appStore';
import './BottomNav.css';

export interface BottomNavItem {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  screen: Screen;
  params?: ScreenParams;
}

interface BottomNavProps {
  items: BottomNavItem[];
}

/** The floating pill-shaped tab bar at the bottom of every client screen
    (ported 1:1 from ClientHome.dc.html's nav markup — the coach side has
    no equivalent, it's a menu-list hub instead). Active state is derived
    from the router's current screen, not passed in, so it can never drift
    out of sync with where the app actually is. Takes its tab list as a
    prop rather than hardcoding one, since which screens exist differs by
    track and none of Track B's client screens exist in this codebase yet. */
export function BottomNav({ items }: BottomNavProps) {
  const screen = useAppStore((s) => s.screen);
  const nav = useAppStore((s) => s.nav);

  return (
    <div className="bottom-nav">
      {items.map((item) => {
        const isActive = item.screen === screen;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav-item${isActive ? ' bottom-nav-item-active' : ''}`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => nav({ screen: item.screen, params: item.params })}
          >
            {isActive ? (
              <span className="bottom-nav-pill">
                <Icon size={19} />
                <span className="bottom-nav-label">{item.label}</span>
              </span>
            ) : (
              <Icon size={22} />
            )}
          </button>
        );
      })}
    </div>
  );
}
