
import type { RequestHandler } from "express";

import { UserModel } from "../../models/user.model.js";
import { OrganisationModel } from "../../models/organisation.model.js";
import { MembershipModel } from "../../models/membership.model.js";
import { RefreshTokenModel } from "../../models/refresh-token.model.js";

import { AppError } from "../../utils/app-error.js";

// --------------------------------------------------
// Platform Admin Controller
// --------------------------------------------------

const getDashboard: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    // 1. Retrieve the authenticated administrator.

    if (!req.auth) {
      throw new AppError(
        401,
        "Authentication required.",
      );
    }

    const admin = await UserModel.findById(
      req.auth.userId,
    ).select("name email platformRole status");

    // 2. Verify current platform privileges again.

    if (
      !admin ||
      admin.status !== "active" ||
      admin.platformRole !== "super_admin"
    ) {
      throw new AppError(
        403,
        "Platform Super Admin access required.",
      );
    }

    // 3. Calculate platform statistics.

    const now = new Date();

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalSuperAdmins,
      totalOrganisations,
      activeMemberships,
      activeSessions,
    ] = await Promise.all([
      UserModel.countDocuments(),

      UserModel.countDocuments({
        status: "active",
      }),

      UserModel.countDocuments({
        status: "suspended",
      }),

      UserModel.countDocuments({
        platformRole: "super_admin",
      }),

      OrganisationModel.countDocuments(),

      MembershipModel.countDocuments({
        status: "active",
      }),

      RefreshTokenModel.countDocuments({
        revokedAt: null,
        expiresAt: { $gt: now },
      }),
    ]);

    // 4. Return dashboard data.

    res.status(200).json({
      success: true,
      data: {
        administrator: {
          id: admin._id.toString(),
          name: admin.name,
          email: admin.email,
          platformRole: admin.platformRole,
        },

        statistics: {
          totalUsers,
          activeUsers,
          suspendedUsers,
          totalSuperAdmins,
          totalOrganisations,
          activeMemberships,
          activeSessions,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// Exports
// --------------------------------------------------

export const adminController = {
  getDashboard,
};
