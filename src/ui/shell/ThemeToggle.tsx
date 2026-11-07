'use client';

import BrightnessAutoRounded from '@mui/icons-material/BrightnessAutoRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import type { SxProps, Theme } from '@mui/material/styles';
import { useColorScheme } from '@mui/material/styles';

// Light, dark or follow the system (UX-4). MUI stores the choice in localStorage and the colour-scheme
// script in the root layout applies it before hydration, so a reload never flashes the other theme.

type Choice = 'system' | 'light' | 'dark';

const ORDER: Choice[] = ['system', 'light', 'dark'];
const LABEL: Record<Choice, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const ICON: Record<Choice, SvgIconComponent> = {
  system: BrightnessAutoRounded,
  light: LightModeRounded,
  dark: DarkModeRounded,
};

export interface ThemeChoice {
  label: string;
  Icon: SvgIconComponent;
  /** System -> Light -> Dark -> System. */
  cycle: () => void;
}

export function useThemeChoice(): ThemeChoice {
  const { mode, setMode } = useColorScheme();
  // mode is undefined until the stored choice is read on the client; render "System" until then.
  const current: Choice = mode ?? 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system';
  return { label: `Theme: ${LABEL[current]}`, Icon: ICON[current], cycle: () => setMode(next) };
}

/** The toggle as a list row, for the drawer footer and the "More" sheet. */
export function ThemeToggleItem({ sx }: { sx?: SxProps<Theme> }) {
  const { label, Icon, cycle } = useThemeChoice();
  return (
    <ListItemButton onClick={cycle} sx={sx}>
      <ListItemIcon>
        <Icon />
      </ListItemIcon>
      <ListItemText primary={label} slotProps={{ primary: { variant: 'button' } }} />
    </ListItemButton>
  );
}
