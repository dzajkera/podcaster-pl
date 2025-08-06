import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

function Navbar() {
  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        {/* Logo */}
        <div style={styles.logo}>
          <Link to="/">
            <img src={logo} alt="Podcaster.pl logo" style={{ height: '32px' }} />
          </Link>
        </div>

        {/* Linki */}
        <div style={styles.links}>
          <Link to="/" style={styles.link}>Strona główna</Link>
          <Link to="/dashboard" style={styles.link}>Dashboard</Link>
        </div>

        {/* Logowanie */}
        <div style={styles.auth}>
          <Link to="/login" style={styles.loginButton}>Zaloguj się</Link>
        </div>
      </div>
    </nav>
  )
}

const styles = {
  nav: {
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    padding: '1rem 0',
  },
  container: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '0 1rem',
    display: 'flex',
    alignItems: 'center',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
  },
  links: {
    display: 'flex',
    gap: '1rem',
    marginLeft: '2rem' // 🔧 tu dodajemy odstęp między logo a linkami
  },
  auth: {
    marginLeft: 'auto',
  },
  link: {
    textDecoration: 'none',
    color: '#111827',
    fontWeight: 500,
  },
  loginButton: {
    textDecoration: 'none',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontWeight: 600,
  }
}

export default Navbar