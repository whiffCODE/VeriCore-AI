
import type { RequestHandler } from "express";

import {
  registerUser,
  loginUser,
} from "./auth.service.js";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.validation.js";

export const registerController: RequestHandler =
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validated as {
        body: RegisterInput;
      };

      const result = await registerUser(body);

      res.status(201).json({
        success: true,
        message: "Account registered successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

export const loginController: RequestHandler =
  async (_req, res, next) => {
    try {
      const { body } = res.locals.validated as {
        body: LoginInput;
      };

      const result = await loginUser(body);

      res.status(200).json({
        success: true,
        message: "Login successful.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
