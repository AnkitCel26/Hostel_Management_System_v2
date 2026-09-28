import { Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Typography
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import LogoutIcon from '@mui/icons-material/Logout';

import { useAuth } from '../context/AuthContext';
import { getHomePath } from '../utils/navigation';

/** Sticky global header with brand and auth-aware actions. */
export function AppHeader() {
  const { user, loading, logout } = useAuth();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="inherit"
      sx={{
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider'
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ gap: 2 }}>
          <Box
            component={RouterLink}
            to="/"
            aria-label="Hostel Management System home"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              color: 'inherit',
              textDecoration: 'none'
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'common.white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ApartmentIcon fontSize="small" />
            </Box>
            <Typography
              variant="h6"
              component="span"
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.01em',
                display: { xs: 'none', sm: 'block' }
              }}
            >
              Hostel Management System
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {!loading &&
            (user ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  component={RouterLink}
                  to={getHomePath(user.role)}
                  variant="contained"
                  size="small"
                >
                  Dashboard
                </Button>
                <Button
                  component={RouterLink}
                  to="/profile"
                  variant="text"
                  size="small"
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Profile
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void logout()}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Logout
                </Button>
                <IconButton
                  aria-label="Log out"
                  size="small"
                  onClick={() => void logout()}
                  sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
                >
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center">
                <Button component={RouterLink} to="/login" variant="text" size="small">
                  Login
                </Button>
                <Button component={RouterLink} to="/register" variant="contained" size="small">
                  Get Started
                </Button>
              </Stack>
            ))}
        </Toolbar>
      </Container>
    </AppBar>
  );
}
