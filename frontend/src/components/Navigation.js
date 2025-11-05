import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const Navigation = ({ activeTab, onTabChange, userRole }) => {
  const [expandedDropdown, setExpandedDropdown] = useState(null);

  // Define tabs based on user role
  const getTabsForRole = () => {
    if (userRole === 'developer') {
      // Developer sees EVERYTHING - all views for testing
      return [
        { id: 'home', label: 'Home', roles: ['developer'], description: 'Employee View' },
        { id: 'dashboard', label: 'Dashboard', roles: ['developer'], description: 'Admin View' },
        {
          id: 'expenses',
          label: 'Expenses',
          roles: ['developer'],
          hasDropdown: true,
          subItems: [
            { id: 'expenses-submit', label: 'Submit New' },
            { id: 'expenses-history', label: 'View History' },
            { id: 'approvals', label: 'Approvals' }
          ]
        },
        { id: 'projects', label: 'Projects', roles: ['developer'] },
        {
          id: 'settings',
          label: 'Settings',
          roles: ['developer'],
          hasDropdown: true,
          subItems: [
            { id: 'costcenters', label: 'Cost Centers' },
            { id: 'locations', label: 'Locations' },
            { id: 'approval-flows', label: 'Approval Flows' },
            { id: 'users', label: 'Users' }
          ]
        }
      ];
    } else if (userRole === 'employee') {
      return [
        { id: 'home', label: 'Home', roles: ['employee'] },
        {
          id: 'expenses',
          label: 'Expenses',
          roles: ['employee'],
          hasDropdown: true,
          subItems: [
            { id: 'expenses-submit', label: 'Submit New' },
            { id: 'expenses-history', label: 'View History' }
          ]
        }
      ];
    } else if (userRole === 'manager') {
      return [
        { id: 'dashboard', label: 'Dashboard', roles: ['manager'] },
        {
          id: 'expenses',
          label: 'Expenses',
          roles: ['manager'],
          hasDropdown: true,
          subItems: [
            { id: 'expenses-submit', label: 'Submit New' },
            { id: 'expenses-history', label: 'View History' },
            { id: 'approvals', label: 'Approvals' }
          ]
        },
        { id: 'projects', label: 'Projects', roles: ['manager'] },
        {
          id: 'settings',
          label: 'Settings',
          roles: ['manager'],
          hasDropdown: true,
          subItems: [
            { id: 'costcenters', label: 'Cost Centers' },
            { id: 'locations', label: 'Locations' }
          ]
        }
      ];
    } else {
      // Admin
      return [
        { id: 'dashboard', label: 'Dashboard', roles: ['admin'] },
        {
          id: 'expenses',
          label: 'Expenses',
          roles: ['admin'],
          hasDropdown: true,
          subItems: [
            { id: 'expenses-submit', label: 'Submit New' },
            { id: 'expenses-history', label: 'View History' },
            { id: 'approvals', label: 'Approvals' }
          ]
        },
        { id: 'projects', label: 'Projects', roles: ['admin'] },
        {
          id: 'settings',
          label: 'Settings',
          roles: ['admin'],
          hasDropdown: true,
          subItems: [
            { id: 'costcenters', label: 'Cost Centers' },
            { id: 'locations', label: 'Locations' },
            { id: 'approval-flows', label: 'Approval Flows' },
            { id: 'users', label: 'Users' }
          ]
        }
      ];
    }
  };

  const tabs = getTabsForRole();

  const handleTabClick = (tabId, hasDropdown) => {
    if (hasDropdown) {
      // If it has a dropdown, toggle the dropdown instead of navigating
      setExpandedDropdown(expandedDropdown === tabId ? null : tabId);
    } else {
      onTabChange(tabId);
      setExpandedDropdown(null);
    }
  };

  const handleSubItemClick = (subItemId) => {
    onTabChange(subItemId);
    setExpandedDropdown(null);
  };

  const isActiveTab = (tab) => {
    if (tab.hasDropdown) {
      // Check if any sub-item is active
      return tab.subItems.some(subItem => activeTab === subItem.id);
    }
    return activeTab === tab.id;
  };

  return (
    <div className="nav">
      <div className="container">
        <div className="nav-tabs">
          {tabs.map((tab) => (
            <div 
              key={tab.id} 
              className="nav-tab-wrapper"
              onMouseEnter={() => tab.hasDropdown && setExpandedDropdown(tab.id)}
              onMouseLeave={() => tab.hasDropdown && setExpandedDropdown(null)}
            >
              <button
                onClick={() => handleTabClick(tab.id, tab.hasDropdown)}
                className={`nav-tab ${isActiveTab(tab) ? 'active' : ''}`}
                title={tab.description}
              >
                {tab.label}
                {tab.hasDropdown && (
                  <ChevronDown 
                    size={16} 
                    style={{ 
                      marginLeft: '4px', 
                      transition: 'transform 0.2s',
                      transform: expandedDropdown === tab.id ? 'rotate(180deg)' : 'rotate(0deg)'
                    }} 
                  />
                )}
              </button>
              
              {tab.hasDropdown && expandedDropdown === tab.id && (
                <div className="nav-dropdown">
                  {tab.subItems.map((subItem) => (
                    <button
                      key={subItem.id}
                      onClick={() => handleSubItemClick(subItem.id)}
                      className={`nav-dropdown-item ${activeTab === subItem.id ? 'active' : ''}`}
                    >
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Navigation;