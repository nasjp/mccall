#[derive(Debug, Default)]
pub struct RuntimeState {
    last_routine_id: Option<String>,
}

impl RuntimeState {
    pub fn last_routine_id(&self) -> Option<&str> {
        self.last_routine_id.as_deref()
    }

    pub fn set_last_routine_id(&mut self, routine_id: String) {
        self.last_routine_id = Some(routine_id);
    }
}
