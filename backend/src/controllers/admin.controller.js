
import mongoose from "mongoose";

import { User } from "../models/user.model.js";
import { AuditLog } from "../models/audit-log.model.js";
import { Session } from "../models/session.model.js";

import {
  revokeAllSessions,
} from "../services/session.service.js";

import {
  sendRecoveryNotice,
} from "../services/email.service.js";

function publicError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function safeUser(user) {
  return {
    id: user._id.toString(),
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    age: user.age,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    subscription: user.subscription,
    createdAt: user.createdAt,
  };
}

async function sendAdminNotice(user, subject, message) {
  try {
    await sendRecoveryNotice({
      email: user.email,
      firstName: user.firstName,
      subject,
      message,
    });
  } catch (error) {
    // The audit entry remains even if SMTP is unavailable.
    console.error("Admin notification failed:", error.message);
  }
}

export async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(req.query.limit) || 20),
    );

    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.role) {
      filter.role = req.query.role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      users: users.map(safeUser),
    });
  } catch (error) {
    next(error);
  }
}

export async function changeUserStatus(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return publicError(
        res,
        400,
        "INVALID_USER_ID",
        "The supplied user identifier is invalid.",
      );
    }

    if (id === req.user._id.toString()) {
      return publicError(
        res,
        400,
        "SELF_MODIFICATION_NOT_ALLOWED",
        "You cannot suspend or reactivate your own account through this endpoint.",
      );
    }

    const { status, reason } = req.validatedBody;

    const user = await User.findById(id);

    if (!user) {
      return publicError(
        res,
        404,
        "USER_NOT_FOUND",
        "The requested user was not found.",
      );
    }

    if (user.status === "pending_deletion") {
      return publicError(
        res,
        409,
        "ACCOUNT_PENDING_DELETION",
        "This account is pending deletion and cannot be modified through this endpoint.",
      );
    }

    if (user.status === status) {
      return res.status(200).json({
        success: true,
        message: "The account already has the requested status.",
        user: safeUser(user),
      });
    }

    const previousStatus = user.status;
    user.status = status;
    await user.save();

    if (status === "suspended") {
      await revokeAllSessions(user._id);
    }

    await AuditLog.create({
      actor: req.user._id,
      target: user._id,
      action:
        status === "suspended"
          ? "user_suspended"
          : "user_reactivated",
      reason,
      metadata: {
        previousStatus,
        newStatus: status,
      },
    });

    if (status === "suspended") {
      await Session.updateMany(
        { user: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }

    await sendAdminNotice(
      user,
      status === "suspended"
        ? "Your VeriCore AI account has been suspended"
        : "Your VeriCore AI account has been reactivated",
      `Your account status has changed from "${previousStatus}" to "${status}". Reason: ${reason}. If you believe this action is incorrect, contact support.`,
    );

    return res.status(200).json({
      success: true,
      message: `User account ${status === "suspended" ? "suspended" : "reactivated"} successfully.`,
      user: safeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

export async function changeUserRole(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return publicError(
        res,
        400,
        "INVALID_USER_ID",
        "The supplied user identifier is invalid.",
      );
    }

    if (id === req.user._id.toString()) {
      return publicError(
        res,
        400,
        "SELF_ROLE_CHANGE_NOT_ALLOWED",
        "You cannot change your own role through this endpoint.",
      );
    }

    const { role, reason } = req.validatedBody;

    const user = await User.findById(id);

    if (!user) {
      return publicError(
        res,
        404,
        "USER_NOT_FOUND",
        "The requested user was not found.",
      );
    }

    if (user.status !== "active") {
      return publicError(
        res,
        409,
        "ACCOUNT_NOT_ACTIVE",
        "Reactivate the account before changing its role.",
      );
    }

    if (user.role === role) {
      return res.status(200).json({
        success: true,
        message: "The account already has the requested role.",
        user: safeUser(user),
      });
    }

    const previousRole = user.role;

    user.role = role;
    await user.save();

    await AuditLog.create({
      actor: req.user._id,
      target: user._id,
      action: "role_changed",
      reason,
      metadata: {
        previousRole,
        newRole: role,
      },
    });

    if (role !== "admin") {
      await revokeAllSessions(user._id);
    }

    await sendAdminNotice(
      user,
      "Your VeriCore AI account role has changed",
      `Your account role has changed from "${previousRole}" to "${role}". Reason: ${reason}.`,
    );

    return res.status(200).json({
      success: true,
      message: "User role updated successfully.",
      user: safeUser(user),
    });
  } catch (error) {
    next(error);
  }
}
