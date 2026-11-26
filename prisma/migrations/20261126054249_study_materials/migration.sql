-- CreateEnum
CREATE TYPE "SummaryLength" AS ENUM ('SHORT', 'MEDIUM', 'DETAILED');

-- CreateTable
CREATE TABLE "summaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_id" UUID,
    "document_title" VARCHAR(255) NOT NULL,
    "length" "SummaryLength" NOT NULL,
    "content" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_sets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcards" (
    "id" UUID NOT NULL,
    "set_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,

    CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_index" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "source_chunk_id" UUID,
    "source_page_start" INTEGER,
    "source_section_label" VARCHAR(255),

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "summaries_user_id_created_at_idx" ON "summaries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "summaries_document_id_idx" ON "summaries"("document_id");

-- CreateIndex
CREATE INDEX "flashcard_sets_user_id_created_at_idx" ON "flashcard_sets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "flashcard_sets_document_id_idx" ON "flashcard_sets"("document_id");

-- CreateIndex
CREATE INDEX "flashcards_set_id_position_idx" ON "flashcards"("set_id", "position");

-- CreateIndex
CREATE INDEX "quizzes_user_id_created_at_idx" ON "quizzes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "quizzes_document_id_idx" ON "quizzes"("document_id");

-- CreateIndex
CREATE INDEX "quiz_questions_quiz_id_position_idx" ON "quiz_questions"("quiz_id", "position");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_created_at_idx" ON "quiz_attempts"("quiz_id", "created_at");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts"("user_id");

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "flashcard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_source_chunk_id_fkey" FOREIGN KEY ("source_chunk_id") REFERENCES "document_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
