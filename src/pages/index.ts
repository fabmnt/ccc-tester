import type { APIRoute } from "astro";

export const GET: APIRoute = ({ redirect }) => redirect("/tests", 308);
