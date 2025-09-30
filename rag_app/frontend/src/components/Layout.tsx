import { Outlet, NavLink } from 'react-router-dom'
import './Layout.css'

const Layout = () => {
  return (
    <div className="container">
      <aside className="sidebar">
        <h1 className="logo">IntraMate</h1>
        <nav>
          <NavLink to="/chat" className="nav-link">
            💬 Chat
          </NavLink>
          <NavLink to="/upload" className="nav-link">
            📁 Upload Documents
          </NavLink>
          <NavLink to="/settings" className="nav-link">
            ⚙️ Settings
          </NavLink>
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout