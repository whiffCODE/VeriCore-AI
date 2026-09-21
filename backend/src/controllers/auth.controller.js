import {
  registerUser,
  resendRegistrationOtp,
  verifyRegistrationOtp,
  setRegistrationPassword,
  loginUser,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword,
  getUserById,
  recoverUserId,
  recoverEmail,
  recoverBoth
} from "../services/auth.service.js";

import {
  createAccessToken,
  verifyRefreshToken
} from "../utils/tokens.js";

import { User } from "../models/User.js";
import { AUTH_COOKIE } from "../constants/auth.js";
import { env } from "../config/env.js";

function setRefreshCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export async function register(req, res, next) {
  try {
    const result = await registerUser(req.body);

    res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function resendOtp(req, res, next) {
  try {
    const result =
      await resendRegistrationOtp(
        req.body.email
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const result =
      await verifyRegistrationOtp(
        req.body
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function setPassword(req, res, next) {
  try {
    const {
      setupToken,
      password,
      confirmPassword
    } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    const result =
      await setRegistrationPassword({
        setupToken,
        password
      });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result =
      await loginUser(req.body);

    setRefreshCookie(
      res,
      result.refreshToken
    );

    delete result.refreshToken;

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res) {
  try {
    const token =
      req.cookies[AUTH_COOKIE];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required"
      });
    }

    const payload =
      verifyRefreshToken(token);

    const user = await User.findById(
      payload.sub
    );

    if (
      !user ||
      user.status !== "ACTIVE"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token"
      });
    }

    const accessToken =
      createAccessToken(user);

    res.json({
      success: true,
      accessToken
    });
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid refresh token"
    });
  }
}

export async function logout(req, res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth"
  });

  res.json({
    success: true,
    message: "Logged out successfully"
  });
}

export async function me(req, res) {
  const user =
    await getUserById(req.user._id);

  res.json({
    success: true,
    user
  });
}

export async function forgotPasswordRequest(
  req,
  res,
  next
) {
  try {
    const result =
      await requestPasswordReset(
        req.body.email
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordVerify(
  req,
  res,
  next
) {
  try {
    const result =
      await verifyPasswordResetOtp(
        req.body
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordReset(
  req,
  res,
  next
) {
  try {
    const {
      resetToken,
      password,
      confirmPassword
    } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    const result =
      await resetPassword({
        resetToken,
        password
      });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function recoverUserIdController(
  req,
  res,
  next
) {
  try {
    const result =
      await recoverUserId(
        req.body.email
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function recoverEmailController(
  req,
  res,
  next
) {
  try {
    const result =
      await recoverEmail(
        req.body.userId
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function recoverBothController(
  req,
  res,
  next
) {
  try {
    const result =
      await recoverBoth(
        req.body.phone
      );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}