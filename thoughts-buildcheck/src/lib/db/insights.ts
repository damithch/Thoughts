import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type {
  Book,
  BookIdea,
  BookIdeaStatus,
  NewBook,
  NewBookIdea,
} from "@/lib/db/types";

export async function createBook(input: NewBook) {
  await ensureInitialized();

  const { rows } = await pool.query<Book>(
    `
      INSERT INTO books (user_id, title, author, source_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, title, author, source_type, added_at
    `,
    [input.userId, input.title, input.author, input.sourceType],
  );

  return rows[0] ?? null;
}

export async function getBooksByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<Book>(
    `
      SELECT id, user_id, title, author, source_type, added_at
      FROM books
      WHERE user_id = $1
      ORDER BY added_at DESC, id DESC
    `,
    [userId],
  );

  return rows;
}

export async function createBookIdea(input: NewBookIdea, userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<BookIdea>(
    `
      INSERT INTO book_ideas (book_id, idea_text, status)
      SELECT b.id, $2, $3
      FROM books b
      WHERE b.id = $1
        AND b.user_id = $4
      RETURNING id, book_id, idea_text, status, created_at, updated_at
    `,
    [input.bookId, input.ideaText, input.status, userId],
  );

  if (!rows[0]) {
    return null;
  }

  const { rows: detailedRows } = await pool.query<BookIdea>(
    `
      SELECT bi.id, bi.book_id, bi.idea_text, bi.status, bi.created_at, bi.updated_at,
             b.title AS book_title, b.author AS book_author, b.source_type
      FROM book_ideas bi
      INNER JOIN books b ON b.id = bi.book_id
      WHERE bi.id = $1
    `,
    [rows[0].id],
  );

  return detailedRows[0] ?? null;
}

export async function updateBookIdeaStatus(bookIdeaId: number, status: BookIdeaStatus, userId: number) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      UPDATE book_ideas bi
      SET status = $1,
          updated_at = NOW()
      FROM books b
      WHERE bi.id = $2
        AND bi.book_id = b.id
        AND b.user_id = $3
    `,
    [status, bookIdeaId, userId],
  );

  return rowCount === 1;
}

export async function getBookIdeasByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<BookIdea>(
    `
      SELECT bi.id, bi.book_id, bi.idea_text, bi.status, bi.created_at, bi.updated_at,
             b.title AS book_title, b.author AS book_author, b.source_type
      FROM book_ideas bi
      INNER JOIN books b ON b.id = bi.book_id
      WHERE b.user_id = $1
      ORDER BY bi.updated_at DESC, bi.id DESC
    `,
    [userId],
  );

  return rows;
}
