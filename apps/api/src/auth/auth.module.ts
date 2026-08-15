import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';

import { ENV, type Env } from '../config/env';
import { NodesModule } from '../nodes/nodes.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    NodesModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        // `expiresIn` is typed as a literal union of duration strings; the value
        // is validated at startup, so widening it here is safe.
        signOptions: { expiresIn: env.JWT_TTL as JwtSignOptions['expiresIn'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
