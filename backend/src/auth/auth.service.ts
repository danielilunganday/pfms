import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { users } from '../db/schema';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  /** Creates the single owner account. Only allowed if no user exists yet. */
  async register(email: string, password: string, fullName?: string) {
    const existing = await this.db.select().from(users).limit(1);
    if (existing.length > 0) {
      throw new UnauthorizedException(
        'This system already has an owner account. Use login instead.',
      );
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await this.db
      .insert(users)
      .values({ email, passwordHash, fullName })
      .returning();
    return this.issueToken(user.id, user.email!);
  }

  async login(email: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueToken(user.id, user.email!);
  }

  private issueToken(sub: string, email: string) {
    const access_token = this.jwt.sign({ sub, email });
    return { access_token };
  }
}
