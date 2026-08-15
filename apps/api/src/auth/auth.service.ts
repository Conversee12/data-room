import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { compare, hash, hashSync } from 'bcryptjs';
import type { AuthResponse, LoginInput, RegisterInput, UserDto } from '@data-room/shared';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { NodesRepository } from '../nodes/nodes.repository';

const PASSWORD_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly nodes: NodesRepository,
  ) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw AppError.emailTaken();

    const passwordHash = await hash(input.password, PASSWORD_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: { id: true, email: true, name: true },
      });

      // A brand new account lands on a usable data room instead of an empty
      // screen with a form. Renaming or deleting it is a normal operation.
      await this.nodes.createDataRoomWithRoot(tx, {
        ownerId: created.id,
        name: 'My Data Room',
        description: null,
      });

      return created;
    });

    return this.issue(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Compare against a dummy hash when the user is unknown so that response
    // time does not reveal whether an email is registered.
    const matches = await compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !matches) throw AppError.invalidCredentials();

    return this.issue({ id: user.id, email: user.email, name: user.name });
  }

  private async issue(user: UserDto): Promise<AuthResponse> {
    // Lifetime comes from the module's signing options, configured once in
    // AuthModule from JWT_TTL.
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token, user };
  }
}

/** Hash of a value nobody can supply; only ever used to equalise login timing. */
const DUMMY_HASH = hashSync(randomUUID(), PASSWORD_ROUNDS);
