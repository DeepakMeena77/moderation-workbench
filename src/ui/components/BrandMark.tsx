import Box from '@mui/material/Box';
import { m3 } from '../theme/theme';

// The product mark (03 sec. 4): a shield with a check on a light accent tile. The shield is the policy, the check
// is a human's verified decision. Drawn inline so it follows the theme in light and dark; src/app/icon.svg is the
// same drawing for the browser tab.
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      sx={{ flexShrink: 0, display: 'block' }}
    >
      <Box component="rect" x="0" y="0" width="32" height="32" rx="8" sx={(t) => ({ fill: m3(t).primaryContainer })} />
      <Box
        component="path"
        d="M16 6.5 L24 9.5 V15.5 C24 20.3 20.6 24.1 16 26 C11.4 24.1 8 20.3 8 15.5 V9.5 Z"
        sx={(t) => ({ fill: 'none', stroke: m3(t).primary, strokeWidth: 2, strokeLinejoin: 'round' })}
      />
      <Box
        component="path"
        d="M12.2 16.2 L15 19 L20.2 13.6"
        sx={(t) => ({
          fill: 'none',
          stroke: m3(t).primary,
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        })}
      />
    </Box>
  );
}

/** The mark followed by the product name, for the sidebar, the phone bar and the public pages. */
export function BrandLockup({ children }: { children: React.ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <BrandMark />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </Box>
    </Box>
  );
}
