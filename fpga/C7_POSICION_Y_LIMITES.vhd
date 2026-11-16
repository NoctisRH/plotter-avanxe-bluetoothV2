library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- C7_POSICION_Y_LIMITES: gestiona la posicion COMANDADA y valida desplazamientos relativos.
-- NO determina la posicion fisica: un motor a pasos puede perder pasos.
-- Las entradas limit_*_n se interpretan como activas en nivel bajo.
entity C7_POSICION_Y_LIMITES is
  generic(MAX_X_STEPS : positive := 6000;
          MAX_Y_STEPS : positive := 6000;
          MAX_Z_STEPS : positive := 600;
          USE_LIMIT_SWITCHES : boolean := false);
  port(clk : in std_logic; rst : in std_logic;
       zero_pos : in std_logic;
       step_x : in std_logic; step_y : in std_logic; step_z : in std_logic;
       dir_x : in std_logic; dir_y : in std_logic; dir_z : in std_logic;
       dx : in signed(15 downto 0); dy : in signed(15 downto 0);
       dz : in signed(15 downto 0);
       limit_x_n : in std_logic; limit_y_n : in std_logic; limit_z_n : in std_logic;
       movimiento_valido : out std_logic;
       movimiento_calibracion_valido : out std_logic;
       paso_bloqueado : out std_logic);
end C7_POSICION_Y_LIMITES;

architecture RTL of C7_POSICION_Y_LIMITES is
  signal pos_x : integer range -MAX_X_STEPS to MAX_X_STEPS := 0;
  signal pos_y : integer range -MAX_Y_STEPS to MAX_Y_STEPS := 0;
  signal pos_z : integer range -MAX_Z_STEPS to MAX_Z_STEPS := 0;
  signal valido, bloqueado : std_logic := '0';
begin
  movimiento_valido <= valido;
  paso_bloqueado <= bloqueado;

  process(pos_x,pos_y,pos_z,dx,dy,dz,limit_x_n,limit_y_n,limit_z_n,
          step_x,step_y,step_z,dir_x,dir_y,dir_z)
    variable nx,ny,nz : integer;
    variable fallo : boolean;
  begin
    nx := pos_x + to_integer(dx);
    ny := pos_y + to_integer(dy);
    nz := pos_z + to_integer(dz);
    fallo := nx < 0 or nx > MAX_X_STEPS or
             ny < 0 or ny > MAX_Y_STEPS or
             nz < 0 or nz > MAX_Z_STEPS;
    if USE_LIMIT_SWITCHES then
      if to_integer(dx) < 0 and limit_x_n = '0' then fallo := true; end if;
      if to_integer(dy) < 0 and limit_y_n = '0' then fallo := true; end if;
      if to_integer(dz) < 0 and limit_z_n = '0' then fallo := true; end if;
    end if;
    if fallo then valido <= '0'; else valido <= '1'; end if;
    fallo := nx < -MAX_X_STEPS or nx > MAX_X_STEPS or
             ny < -MAX_Y_STEPS or ny > MAX_Y_STEPS or
             nz < -MAX_Z_STEPS or nz > MAX_Z_STEPS;
    if USE_LIMIT_SWITCHES then
      if to_integer(dx) < 0 and limit_x_n = '0' then fallo := true; end if;
      if to_integer(dy) < 0 and limit_y_n = '0' then fallo := true; end if;
      if to_integer(dz) < 0 and limit_z_n = '0' then fallo := true; end if;
    end if;
    if fallo then movimiento_calibracion_valido <= '0';
    else movimiento_calibracion_valido <= '1'; end if;

    fallo := false;
    if step_x = '1' then
      if (dir_x = '0' and pos_x = -MAX_X_STEPS) or
         (dir_x = '1' and pos_x = MAX_X_STEPS) then fallo := true; end if;
      if USE_LIMIT_SWITCHES and dir_x = '0' and limit_x_n = '0' then fallo := true; end if;
    end if;
    if step_y = '1' then
      if (dir_y = '0' and pos_y = -MAX_Y_STEPS) or
         (dir_y = '1' and pos_y = MAX_Y_STEPS) then fallo := true; end if;
      if USE_LIMIT_SWITCHES and dir_y = '0' and limit_y_n = '0' then fallo := true; end if;
    end if;
    if step_z = '1' then
      if (dir_z = '0' and pos_z = -MAX_Z_STEPS) or
         (dir_z = '1' and pos_z = MAX_Z_STEPS) then fallo := true; end if;
      if USE_LIMIT_SWITCHES and dir_z = '0' and limit_z_n = '0' then fallo := true; end if;
    end if;
    if fallo then bloqueado <= '1'; else bloqueado <= '0'; end if;
  end process;

  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' or zero_pos = '1' then
        pos_x <= 0; pos_y <= 0; pos_z <= 0;
      else
        if step_x = '1' and bloqueado = '0' then
          if dir_x = '1' then pos_x <= pos_x + 1;
          else pos_x <= pos_x - 1; end if;
        end if;
        if step_y = '1' and bloqueado = '0' then
          if dir_y = '1' then pos_y <= pos_y + 1;
          else pos_y <= pos_y - 1; end if;
        end if;
        if step_z = '1' and bloqueado = '0' then
          if dir_z = '1' then pos_z <= pos_z + 1;
          else pos_z <= pos_z - 1; end if;
        end if;
      end if;
    end if;
  end process;
end RTL;