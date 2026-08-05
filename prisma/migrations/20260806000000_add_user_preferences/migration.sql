-- 用户偏好 JSON。见 src/lib/userPrefs.ts。
-- 空/NULL = 用默认值（首次访问 /api/user/preferences PATCH 时惰性填入）。

-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferences" TEXT;
