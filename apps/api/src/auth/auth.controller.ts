import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  loginSchema,
  registerSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
  type UserDto,
} from '@data-room/shared';

import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(zodBody(registerSchema)) body: RegisterInput): Promise<AuthResponse> {
    return this.auth.register(body);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body(zodBody(loginSchema)) body: LoginInput): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  /** Used by the client on boot to tell a valid session from a stale token. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): UserDto {
    return { id: user.id, email: user.email, name: user.name };
  }
}
