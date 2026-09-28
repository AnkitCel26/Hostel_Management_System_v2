import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCoreEntities1790421937187 implements MigrationInterface {
    name = 'CreateCoreEntities1790421937187'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await queryRunner.query(`CREATE TABLE "rooms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "roomNumber" character varying(20) NOT NULL, "roomType" character varying(30), "capacity" integer NOT NULL DEFAULT '1', "occupiedCount" integer NOT NULL DEFAULT '0', "rent" integer NOT NULL DEFAULT '0', "floor" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pgId" uuid NOT NULL, CONSTRAINT "UQ_9dbcbb65a42c4636fe7990e2780" UNIQUE ("pgId", "roomNumber"), CONSTRAINT "PK_0368a2d7c215f2d0458a54933f2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."complaint_status" AS ENUM('open', 'in_progress', 'resolved')`);
        await queryRunner.query(`CREATE TABLE "complaints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(160) NOT NULL, "description" text NOT NULL, "status" "public"."complaint_status" NOT NULL DEFAULT 'open', "resolvedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid NOT NULL, "pgId" uuid NOT NULL, CONSTRAINT "PK_4b7566a2a489c2cc7c12ed076ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "announcements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(160) NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pgId" uuid NOT NULL, "createdById" uuid NOT NULL, CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "pgs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "address" character varying(255) NOT NULL, "city" character varying(80), "contactNumber" character varying(20), "description" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_983113f1d6e9c89830f9ccc3925" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenant_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "docName" character varying(120) NOT NULL, "docUrl" character varying(500) NOT NULL, "docNumber" character varying(60), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid NOT NULL, CONSTRAINT "PK_9790c9cdb14cfc71b69a5dd5506" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payment_status" AS ENUM('pending', 'partial', 'paid', 'overdue')`);
        await queryRunner.query(`CREATE TABLE "rent_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" integer NOT NULL DEFAULT '0', "paidAmount" integer NOT NULL DEFAULT '0', "dueDate" date NOT NULL, "paidDate" date, "status" "public"."payment_status" NOT NULL DEFAULT 'pending', "notes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid NOT NULL, CONSTRAINT "PK_deca3deaaf83de65c31d5efe8a3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "phone" character varying(20), "emergencyContact" character varying(120), "joinDate" date, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "pgId" uuid NOT NULL, "roomId" uuid, CONSTRAINT "REL_e599183d152a58fb0936b70ac5" UNIQUE ("userId"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_role" AS ENUM('Admin', 'Tenant')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "email" character varying(160) NOT NULL, "password" character varying(255) NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'Tenant', "phone" character varying(20), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`ALTER TABLE "rooms" ADD CONSTRAINT "FK_21c1f2b15230f493eca3e2c7c0f" FOREIGN KEY ("pgId") REFERENCES "pgs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_878a9fe3af62490a5f791c47987" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_ddf1a3d6f3fdd3dcafdeaddc302" FOREIGN KEY ("pgId") REFERENCES "pgs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "FK_39b393d2eaaf764a5acbd2e7a13" FOREIGN KEY ("pgId") REFERENCES "pgs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "FK_197a06ce0989e489974fdc26ca8" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_documents" ADD CONSTRAINT "FK_e66a753b41023f762820d8b73b1" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rent_payments" ADD CONSTRAINT "FK_7ca3bc6f27c3bc26f6e17a34bc3" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD CONSTRAINT "FK_e599183d152a58fb0936b70ac5d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD CONSTRAINT "FK_aa195bfd4862cf9a67256822748" FOREIGN KEY ("pgId") REFERENCES "pgs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD CONSTRAINT "FK_c28ba56dc34be804412186aae7e" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "FK_c28ba56dc34be804412186aae7e"`);
        await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "FK_aa195bfd4862cf9a67256822748"`);
        await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "FK_e599183d152a58fb0936b70ac5d"`);
        await queryRunner.query(`ALTER TABLE "rent_payments" DROP CONSTRAINT "FK_7ca3bc6f27c3bc26f6e17a34bc3"`);
        await queryRunner.query(`ALTER TABLE "tenant_documents" DROP CONSTRAINT "FK_e66a753b41023f762820d8b73b1"`);
        await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "FK_197a06ce0989e489974fdc26ca8"`);
        await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "FK_39b393d2eaaf764a5acbd2e7a13"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_ddf1a3d6f3fdd3dcafdeaddc302"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_878a9fe3af62490a5f791c47987"`);
        await queryRunner.query(`ALTER TABLE "rooms" DROP CONSTRAINT "FK_21c1f2b15230f493eca3e2c7c0f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."user_role"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TABLE "rent_payments"`);
        await queryRunner.query(`DROP TYPE "public"."payment_status"`);
        await queryRunner.query(`DROP TABLE "tenant_documents"`);
        await queryRunner.query(`DROP TABLE "pgs"`);
        await queryRunner.query(`DROP TABLE "announcements"`);
        await queryRunner.query(`DROP TABLE "complaints"`);
        await queryRunner.query(`DROP TYPE "public"."complaint_status"`);
        await queryRunner.query(`DROP TABLE "rooms"`);
    }

}
