// apps/web/src/components/Layout.jsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard Home', path: '/', icon: '🏠' },
    { name: 'Live Game Stats', path: '/live', icon: '🏀' },
    { name: 'Defensive Trends', path: '/defense', icon: '🛡️' },
    { name: 'Player Insights', path: '/players', icon: '📊' },
    { name: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-blue-800">
          Gaucho Analytics
        </div>
        <nav className="flex-grow mt-4">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center px-6 py-3 text-left transition-colors ${
                location.pathname === item.path 
                  ? 'bg-blue-700 border-r-4 border-yellow-400' 
                  : 'hover:bg-blue-800'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>
        <div className="p-4 text-xs text-blue-300">
          v0.1.0-alpha
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm z-10">
          <div className="px-8 py-4 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-800">
              {menuItems.find(i => i.path === location.pathname)?.name || 'Analytics'}
            </h1>
            <div className="text-sm text-gray-500">UCSB Basketball vs. Opponent</div>
          </div>
        </header>
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
