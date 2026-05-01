-- Allow creators to view their conversations
DROP POLICY IF EXISTS "Participants can view their conversations" ON public.conversations;

CREATE POLICY "Participants can view their conversations"
ON public.conversations FOR SELECT
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conversations.id AND user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
