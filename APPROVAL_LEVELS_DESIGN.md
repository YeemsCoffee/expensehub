# Approval Levels - Multi-Approver Per Level Design

## Current vs. New Structure

### Current (Flat Array):
```javascript
approvers: [1, 2, 3]  // Level 1=User1, Level 2=User2, Level 3=User3
```

### New (Array of Arrays):
```javascript
approvalLevels: [
  [1, 2],     // Level 1: Users 1 AND 2 (both at same level)
  [3],        // Level 2: User 3
  [4, 5, 6]   // Level 3: Users 4, 5, AND 6 (all at same level)
]
```

## UI Changes

### Approval Flow Builder:
```
┌─────────────────────────────────────────────┐
│ Level 1                         [Add User]  │
│ ┌─────────────┐  ┌─────────────┐          │
│ │ John Smith  │  │ Mary Jones  │  [X]     │
│ │ Manager     │  │ Manager     │  [X]     │
│ └─────────────┘  └─────────────┘          │
│                              [Remove Level] │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ Level 2                         [Add User]  │
│ ┌─────────────┐                            │
│ │ Sarah Lee   │                   [X]      │
│ │ Director    │                            │
│ └─────────────┘                            │
│                              [Remove Level] │
└─────────────────────────────────────────────┘

[+ Add New Level]
```

## Key Features:

1. **Add Level Button**: Create a new approval level
2. **Add User to Level**: Add multiple users to the same level
3. **Remove User**: Remove a specific user from a level
4. **Remove Level**: Delete an entire level
5. **Reorder Levels**: Drag and drop to change level order
6. **Visual Grouping**: Clear visual separation between levels

## Approval Logic:

- **Any one approver at a level can approve** (OR logic)
- Once ONE person at a level approves, it moves to the next level
- All levels must be completed for full approval

## Example Flow:

**Level 1: John OR Mary** → **Level 2: Sarah** → **Level 3: Tom OR Lisa OR Mike**

If Mary approves at Level 1, it moves to Sarah at Level 2.
Sarah approves, then ANY of Tom, Lisa, or Mike can approve to complete.

## Backend Changes:

1. New database column: `approval_levels JSONB`
2. Keep `approvers INTEGER[]` for backward compatibility
3. Auto-sync between the two columns
4. Update API endpoints to accept/return new structure

## Migration Required:

Run `approval_levels_migration.sql` to update database schema.
