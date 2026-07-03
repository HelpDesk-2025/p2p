import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission, hasAllPermissions, MODULE_PERMISSIONS } from './permissions';

describe('hasPermission', () => {
  it('denies access when userPermissions is null (logged out / not loaded)', () => {
    expect(hasPermission(null, MODULE_PERMISSIONS.PURCHASE_REQUISITION)).toBe(false);
  });

  it('grants access to every module when hasFullAccess is true, regardless of the permissions list', () => {
    const admin = { role: 'admin', permissions: [], hasFullAccess: true };
    expect(hasPermission(admin, MODULE_PERMISSIONS.PURCHASE_REQUISITION)).toBe(true);
    expect(hasPermission(admin, MODULE_PERMISSIONS.CANVASS)).toBe(true);
  });

  it('grants access only for permissions present in the list when hasFullAccess is false', () => {
    const requester = {
      role: 'standard',
      permissions: [MODULE_PERMISSIONS.PURCHASE_REQUISITION],
      hasFullAccess: false,
    };
    expect(hasPermission(requester, MODULE_PERMISSIONS.PURCHASE_REQUISITION)).toBe(true);
    expect(hasPermission(requester, MODULE_PERMISSIONS.CASH_ADVANCE)).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('denies access when userPermissions is null', () => {
    expect(hasAnyPermission(null, [MODULE_PERMISSIONS.PURCHASE_REQUISITION])).toBe(false);
  });

  it('grants access if at least one requested permission is present', () => {
    const requester = {
      role: 'standard',
      permissions: [MODULE_PERMISSIONS.CANVASS],
      hasFullAccess: false,
    };
    expect(
      hasAnyPermission(requester, [MODULE_PERMISSIONS.PURCHASE_REQUISITION, MODULE_PERMISSIONS.CANVASS])
    ).toBe(true);
    expect(
      hasAnyPermission(requester, [MODULE_PERMISSIONS.PURCHASE_REQUISITION, MODULE_PERMISSIONS.CASH_ADVANCE])
    ).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('requires every listed permission to be present', () => {
    const requester = {
      role: 'standard',
      permissions: [MODULE_PERMISSIONS.PURCHASE_REQUISITION, MODULE_PERMISSIONS.CANVASS],
      hasFullAccess: false,
    };
    expect(
      hasAllPermissions(requester, [MODULE_PERMISSIONS.PURCHASE_REQUISITION, MODULE_PERMISSIONS.CANVASS])
    ).toBe(true);
    expect(
      hasAllPermissions(requester, [
        MODULE_PERMISSIONS.PURCHASE_REQUISITION,
        MODULE_PERMISSIONS.CANVASS,
        MODULE_PERMISSIONS.CASH_ADVANCE,
      ])
    ).toBe(false);
  });
});
