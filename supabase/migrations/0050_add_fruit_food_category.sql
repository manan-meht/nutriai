alter table food_knowledge_base drop constraint food_knowledge_base_category_check;

alter table food_knowledge_base add constraint food_knowledge_base_category_check
  check (category in ('protein_anchor', 'partial_protein', 'vegetable_fiber', 'fruit', 'carb_base', 'fat_source', 'enjoyment_food', 'sugary_drink', 'mixed_meal', 'unknown'));
