import {
  INestApplication,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthModule } from 'src/auth/auth.module';
import { TokenPayload } from 'src/auth/dto/TokenPayload';
import { User } from 'src/entities/user.entity';
import { IntraService } from 'src/intra/intra.service';
import { IntraUser } from 'src/users/dto/intraUser.dto';
import * as request from 'supertest';
import { getTestDbModule } from 'test/utils';
import { Repository } from 'typeorm';

function toUserEntity(intraUser: IntraUser): User {
  return {
    id: intraUser.id,
    tfa_enabled: false,
    tfa_secret: null,
    login_intra: intraUser.login,
    profile: {
      id: intraUser.id,
      name: intraUser.displayname,
      nickname: intraUser.login,
      avatar_path: intraUser.image_url,
      status: 'OFFLINE',
      wins: 0,
      losses: 0,
      mmr: 0,
    },
    blocked: [],
    friend_requests: [],
    friends: [],
  };
}

describe('Authentication', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let intraServiceMock = {
    async getUserToken(code: string) {
      return {};
    },
    async getUserInfo(access_token: string) {
      return {};
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const secret = 'test secret';
    process.env.JWT_SECRET = secret;

    jwtService = new JwtService({ secret });

    const testDbModule = getTestDbModule();
    const moduleRef = await Test.createTestingModule({
      imports: [testDbModule, AuthModule],
    })
      .overrideProvider(IntraService)
      .useValue(intraServiceMock)
      .compile();

    userRepository = moduleRef.get('UserRepository');
    await userRepository.delete({});

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should authenticate a user with the right code', async () => {
    jest
      .spyOn(intraServiceMock, 'getUserToken')
      .mockImplementationOnce(async () => {
        return {
          access_token: 'abcdefg',
        };
      });
    jest
      .spyOn(intraServiceMock, 'getUserInfo')
      .mockImplementationOnce(async () => {
        return {
          id: 42,
          login: 'psergio-',
          displayname: 'Paulo',
          image_url: null,
        };
      });
    const code = 'abcd';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ code });

    expect(response.status).toBe(201);
    expect(intraServiceMock.getUserInfo).toHaveBeenCalledWith('abcdefg');
    expect(response.body).toHaveProperty('access_token');
  });

  it("should return 401 if intra doesn't validate the code", async () => {
    jest
      .spyOn(intraServiceMock, 'getUserToken')
      .mockImplementationOnce(async (code) => {
        throw new UnauthorizedException('Mocked unauthorized exception');
      });
    const code = 'abcd';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ code });

    expect(response.status).toBe(401);
    expect(intraServiceMock.getUserInfo).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      error: 'Unauthorized',
      message: 'Mocked unauthorized exception',
      statusCode: 401,
    });
  });

  it('should return 500 if client credentials are not valid', async () => {
    jest
      .spyOn(intraServiceMock, 'getUserToken')
      .mockImplementationOnce(async () => {
        throw new InternalServerErrorException(
          'Mocked internal server error exception',
        );
      });
    const code = 'abcd';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ code });

    expect(response.status).toBe(500);
    expect(intraServiceMock.getUserInfo).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      error: 'Internal Server Error',
      message: 'Mocked internal server error exception',
      statusCode: 500,
    });
  });

  it("should return a '2fa disabled' token if user is new", async () => {
    jest
      .spyOn(intraServiceMock, 'getUserToken')
      .mockImplementationOnce(async () => {
        return {
          access_token: 'abcdefg',
        };
      });
    jest
      .spyOn(intraServiceMock, 'getUserInfo')
      .mockImplementationOnce(async () => {
        return {
          id: 42,
          login: 'psergio-',
          displayname: 'Paulo',
          image_url: null,
        };
      });
    const code = 'abcd';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ code });

    expect(response.status).toBe(201);
    expect(intraServiceMock.getUserInfo).toHaveBeenCalled();
    expect(response.body).toHaveProperty('access_token');
    const payload = jwtService.verify<TokenPayload>(response.body.access_token);
    expect(payload.tfa_enabled).toBe(false);
  });

  it("should return a '2fa enabled' token if user has it activated", async () => {
    const intraUser = {
      id: 42,
      login: 'psergio-',
      displayname: 'Paulo',
      image_url: null,
    };
    jest
      .spyOn(intraServiceMock, 'getUserToken')
      .mockImplementationOnce(async () => {
        return {
          access_token: 'abcdefg',
        };
      });

    jest.spyOn(intraServiceMock, 'getUserInfo').mockResolvedValue(intraUser);

    const saved = await userRepository.save(toUserEntity(intraUser));
    saved.tfa_enabled = true;
    await userRepository.save(saved);

    const code = 'abcd';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ code });

    expect(response.status).toBe(201);
    expect(intraServiceMock.getUserInfo).toHaveBeenCalled();
    expect(response.body).toHaveProperty('access_token');
    const payload = jwtService.verify<TokenPayload>(response.body.access_token);
    expect(payload).toHaveProperty('tfa_enabled');
    expect(payload).toHaveProperty('is_authenticated_twice');
    expect(payload.tfa_enabled).toBe(true);
    expect(payload.is_authenticated_twice).toBe(false);
  });
});
