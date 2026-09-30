import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#1976D2' },
    secondary: { main: '#9C27B0' },
    success: { main: '#2E7D32' },
    warning: { main: '#ED6C02' },
    error: { main: '#D32F2F' },
    background: { default: '#F5F7FA', paper: '#FFFFFF' },
    text: { primary: '#1F2937', secondary: '#6B7280' },
    divider: 'rgba(31, 41, 55, 0.08)'
  },
  shape: {
    borderRadius: 8
  },
  typography: {
    // Inter is loaded in index.html.
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 700, fontSize: '2.5rem', lineHeight: 1.15, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, fontSize: '2rem', lineHeight: 1.2, letterSpacing: '-0.015em' },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        }
      }
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': {
            outline: '2px solid #1976D2',
            outlineOffset: 2
          }
        }
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 12,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.06)'
        })
      }
    },
    MuiTextField: {
      defaultProps: { fullWidth: true }
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10 }
      }
    }
  }
});
