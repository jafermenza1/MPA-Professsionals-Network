"use client";

import { useState } from "react";
import { LogOut, Power, MailCheck } from "lucide-react";
import { FormFeedback } from "../../components/form-feedback";
import { Badge } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import styles from "./users-table.module.css";

export type ManagedUser = {
  id: string;
  email: string;
  username: string;
  status: string;
  roles: string[];
  permissions?: string[];
};

export type ManagedRole = {
  role_code: string;
  name: string;
  description?: string | null;
  scope: string;
  assignable: boolean;
  privileged: boolean;
  assignmentNote?: string | null;
};

export type ManagedPermission = { permission_code: string; area: string; label: string; description: string; sensitive: boolean; system_only: boolean };

type Props = {
  users: ManagedUser[];
  roleCatalog: ManagedRole[];
  permissionCatalog: ManagedPermission[];
  currentRoles: string[];
  currentUserId: string;
  token: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
};

export function UsersTable({
  users,
  roleCatalog,
  permissionCatalog,
  currentRoles,
  currentUserId,
  token,
  onChanged,
  onError,
}: Props) {
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const isSystemAdmin = currentRoles.includes("system_admin");
  const choices = roleCatalog.filter(
    (role) => role.assignable && (!role.privileged || isSystemAdmin),
  );

  async function updateUser(
    user: ManagedUser,
    key: string,
    action: () => Promise<unknown>,
  ) {
    const reason = reasons[user.id]?.trim() || "";
    if (!reason) {
      onError("Enter a reason in this account’s row before taking the action.");
      return;
    }
    setBusy(key);
    setNotice("");
    onError("");
    try {
      await action();
      setReasons((current) => ({ ...current, [user.id]: "" }));
      await onChanged();
    } catch (error) {
      onError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "The account action failed.",
      );
    } finally {
      setBusy("");
    }
  }

  function canManage(user: ManagedUser) {
    const targetIsPrivileged = user.roles.some(
      (roleCode) => roleCatalog.find((role) => role.role_code === roleCode)?.privileged,
    );
    return user.id !== currentUserId && (!targetIsPrivileged || isSystemAdmin);
  }

  return (
    <div className={styles.wrap}>
      {notice && <FormFeedback kind="success" message={notice} />}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Status</th>
            <th scope="col">Platform roles</th>
            <th scope="col">Change role</th>
            <th scope="col">Audit reason</th>
            <th scope="col">Account actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const manageable = canManage(user);
            const reason = reasons[user.id] || "";
            const selection = selectedRoles[user.id] || "";
            return (
              <tr key={user.id}>
                <th scope="row" className={styles.account}>
                  <b>{user.email}</b>
                  <small>{user.username}</small>
                  {isSystemAdmin && permissionCatalog.length > 0 && <details style={{ marginTop: 8, maxWidth: 330 }}>
                    <summary>Detailed permission matrix ({(permissionDrafts[user.id] ?? user.permissions ?? []).length} assigned)</summary>
                    <div className={styles.roleList} style={{ marginTop: 8 }}>
                      {permissionCatalog.map(permission => {
                        const selected = permissionDrafts[user.id] ?? user.permissions ?? [];
                        return <label key={permission.permission_code} style={{ display: "flex", gap: 7, alignItems: "flex-start", whiteSpace: "normal", fontWeight: 400 }}>
                          <input type="checkbox" checked={selected.includes(permission.permission_code)} disabled={!manageable || permission.system_only || busy === "permissions:" + user.id}
                            onChange={event => setPermissionDrafts(current => ({ ...current, [user.id]: event.target.checked ? [...selected, permission.permission_code] : selected.filter(code => code !== permission.permission_code) }))} />
                          <span><b>{permission.area} · {permission.label}{permission.system_only ? " · System-only" : ""}</b><small>{permission.description}{permission.sensitive ? " Sensitive capability; changes are audited." : ""}</small></span>
                        </label>;
                      })}
                      <button className="btn btn-primary" type="button" disabled={!manageable || !reason.trim() || busy === "permissions:" + user.id}
                        onClick={() => void updateUser(user, "permissions:" + user.id, () => api("/api/v1/admin/users/" + user.id + "/permissions", { method: "PATCH", body: JSON.stringify({ permissionCodes: permissionDrafts[user.id] ?? user.permissions ?? [], reason }) }, token))}>Save permission matrix</button>
                      <small className={styles.muted}>Changing direct permissions revokes the user's active sessions. Organization and job scope, ownership, privacy, reviewer independence, and workflow validation still apply.</small>
                    </div>
                  </details>}
                </th>
                <td>
                  <Badge tone={user.status === "active" ? "green" : "gold"}>
                    {user.status}
                  </Badge>
                </td>
                <td>
                  <div className={styles.roleList}>
                    {user.roles.length ? (
                      user.roles.map((roleCode) => {
                        const role = roleCatalog.find(
                          (item) => item.role_code === roleCode,
                        );
                        const canRemove =
                          manageable && (!role?.privileged || isSystemAdmin);
                        return (
                          <span className={styles.role} key={roleCode}>
                            <Badge tone="slate">{role?.name || roleCode}</Badge>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              disabled={!canRemove || busy === user.id}
                              onClick={() =>
                                void updateUser(user, user.id, () =>
                                  api(
                                    "/api/v1/admin/users/" + user.id,
                                    {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        removeRoleCode: roleCode,
                                        reason,
                                      }),
                                    },
                                    token,
                                  ),
                                )
                              }
                            >
                              Remove role
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span className={styles.muted}>No platform roles</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className={styles.roleAction}>
                    <select
                      aria-label={"Platform role for " + user.email}
                      value={selection}
                      disabled={!manageable}
                      onChange={(event) =>
                        setSelectedRoles((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Choose role</option>
                      {choices.map((role) => (
                        <option key={role.role_code} value={role.role_code}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={
                        !manageable ||
                        !selection ||
                        user.roles.includes(selection) ||
                        !reason.trim() ||
                        busy === user.id
                      }
                      onClick={() =>
                        void updateUser(user, user.id, () =>
                          api(
                            "/api/v1/admin/users/" + user.id,
                            {
                              method: "PATCH",
                              body: JSON.stringify({
                                roleCode: selection,
                                reason,
                              }),
                            },
                            token,
                          ),
                        )
                      }
                    >
                      Grant role
                    </button>
                  </div>
                </td>
                <td>
                  <label className={styles.reasonField}>
                    <span>Required for access or session changes</span>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={reason}
                      disabled={!manageable}
                      placeholder="Why is this change needed?"
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </td>
                <td>
                  <div className={styles.accountActions}>
                    {user.status === "active" ? (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={!manageable || !reason.trim() || busy === user.id}
                        onClick={() =>
                          void updateUser(user, user.id, () =>
                            api(
                              "/api/v1/admin/users/" + user.id,
                              {
                                method: "PATCH",
                                body: JSON.stringify({
                                  status: "suspended",
                                  reason,
                                }),
                              },
                              token,
                            ),
                          )
                        }
                      >
                        <Power size={15} /> Suspend account
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={!manageable || !reason.trim() || busy === user.id}
                        onClick={() =>
                          void updateUser(user, user.id, () =>
                            api(
                              "/api/v1/admin/users/" + user.id,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ status: "active", reason }),
                              },
                              token,
                            ),
                          )
                        }
                      >
                        <Power size={15} /> Reactivate
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={!manageable || !reason.trim() || busy === "one-time-link:" + user.id}
                      onClick={() => void updateUser(user, "one-time-link:" + user.id, async () => {
                        const result = await api<{queued:boolean;email:string;expiresInMinutes:number;message:string}>(
                          "/api/v1/admin/users/" + user.id + "/one-time-session-link",
                          { method: "POST", body: JSON.stringify({ reason }) },
                          token,
                        );
                        setNotice(result.message + " Recipient: " + result.email + ". Confirm the person’s identity through a known channel before asking them to use the link.");
                      })}
                    >
                      <MailCheck size={15} /> Send one-time sign-in link
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={!manageable || !reason.trim() || busy === user.id}
                      onClick={() =>
                        void updateUser(user, user.id, () =>
                          api(
                            "/api/v1/admin/users/" + user.id + "/revoke-sessions",
                            {
                              method: "POST",
                              body: JSON.stringify({ reason }),
                            },
                            token,
                          ),
                        )
                      }
                    >
                      <LogOut size={15} /> Revoke sessions
                    </button>
                  </div>
                  {!manageable && (
                    <small className={styles.muted}>
                      Use a separate system administrator to manage privileged accounts and your own account.
                    </small>
                  )}
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={6} className={styles.empty}>
                No accounts match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <details className={styles.catalog}>
        <summary>Platform role catalog and scope boundaries</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Scope</th>
              <th scope="col">Assignment</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {roleCatalog.map((role) => (
              <tr key={role.role_code}>
                <th scope="row">{role.name}</th>
                <td>{role.scope}</td>
                <td>{role.assignable ? "Assignable platform role" : "Managed in scoped workspace"}{role.privileged ? " · system administrator only" : ""}</td>
                <td>{role.assignmentNote || role.description || "No description recorded."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}